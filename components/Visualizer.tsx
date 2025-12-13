
import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import { ParsedNote, Tuning, PlaybackState, TICKS_COUNT_IN, NoteConfig } from '../types';
import { STRING_CONFIGS, NOTE_COLORS } from '../constants';
import { audioEngine } from '../utils/audio';

interface VisualizerProps {
  data: ParsedNote[];
  currentTick: number;
  tuning: Tuning;
  rhythmMode: 'binary' | 'ternary';
  playbackState: PlaybackState;
  isExporting?: boolean;
  onNoteClick?: (note: ParsedNote, x: number, y: number) => void;
  onNoteDrag?: (note: ParsedNote, newStringId: string, newTick: number) => void;
  onNoteHover?: (note: ParsedNote | null, x: number, y: number) => void;
  selectedNoteId?: string | null;
  selectedNoteIds?: string[];
  onBackgroundClick?: (tick: number, stringId: string | undefined, x: number, y: number) => void;
  onDeleteNote?: (note: ParsedNote) => void;
  onSeek?: (tick: number) => void;
  onNoteContextMenu?: (note: ParsedNote, x: number, y: number) => void;
  onMultiSelectionEnd?: (selectedIds: string[], x: number, y: number) => void;
}

export interface VisualizerHandle {
  getCanvasStream: () => MediaStream | null;
  scrollToBottom: () => void;
}

const NOTE_RADIUS = 7;
const HIT_RADIUS = 15;
const TICK_HEIGHT = 8;
const CANVAS_PADDING_TOP = 10; 
const PLAYHEAD_OFFSET_TICKS = 12;

const Visualizer = forwardRef<VisualizerHandle, VisualizerProps>(({ 
  data, currentTick, tuning, rhythmMode, playbackState, isExporting,
  onNoteClick, onNoteDrag, onNoteHover, selectedNoteId, selectedNoteIds = [],
  onBackgroundClick, onDeleteNote, onSeek, onNoteContextMenu, onMultiSelectionEnd 
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const interactionRef = useRef<{
    mode: 'IDLE' | 'DRAG_NOTE' | 'POTENTIAL_LEFT_BG' | 'POTENTIAL_RIGHT_BG' | 'BOX_SELECT';
    startX: number;
    startY: number;
    startScrollTop: number;
    currentX: number;
    currentY: number;
    activeNote: ParsedNote | null;
    activeNoteOriginalString: string | null;
    activeNoteOriginalTick: number;
    selectionRect: { startTick: number, endTick: number, startX: number, endX: number } | null;
  }>({
    mode: 'IDLE',
    startX: 0, startY: 0, startScrollTop: 0, currentX: 0, currentY: 0,
    activeNote: null, activeNoteOriginalString: null, activeNoteOriginalTick: 0,
    selectionRect: null
  });

  const hoveredTickRef = useRef<number | null>(null);
  const hoveredGridTickRef = useRef<number | null>(null);
  
  const autoScrollSpeedRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const autoScrollReqRef = useRef<number | null>(null);

  const [dragSelectedIds, setDragSelectedIds] = useState<string[]>([]);
  const dragSelectedIdsRef = useRef<string[]>([]);

  useImperativeHandle(ref, () => ({
    getCanvasStream: () => {
      if (canvasRef.current) return canvasRef.current.captureStream(30);
      return null;
    },
    scrollToBottom: () => {
      if (containerRef.current) {
        containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
      }
    }
  }));

  const isPlayingOrExporting = playbackState === PlaybackState.PLAYING || isExporting;
  const baseTickOffset = isPlayingOrExporting ? 0 : TICKS_COUNT_IN;

  useEffect(() => {
    if (playbackState === PlaybackState.PLAYING && containerRef.current && !isExporting) {
       containerRef.current.scrollTop = (currentTick - PLAYHEAD_OFFSET_TICKS - baseTickOffset) * TICK_HEIGHT;
    } else if (currentTick === TICKS_COUNT_IN && containerRef.current && !isExporting) {
       containerRef.current.scrollTop = 0;
    }
  }, [currentTick, playbackState, isExporting, baseTickOffset]);

  const lastNote = data.length > 0 ? data[data.length - 1] : null;
  const maxTick = lastNote ? lastNote.tick + lastNote.duration : 100;
  const contentHeight = ((maxTick - baseTickOffset) * TICK_HEIGHT) + 300; 

  const getCanvasCoordinates = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ('changedTouches' in e) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    } else if ('touches' in e) {
        const touchEvent = e as any;
        clientX = touchEvent.touches[0].clientX;
        clientY = touchEvent.touches[0].clientY;
    } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const getResponsiveSpacing = (width: number) => {
      const responsiveSpacing = width / 14; 
      return Math.min(50, responsiveSpacing);
  };

  const getNotePosition = (note: ParsedNote, width: number, scrollTop: number) => {
      const centerX = width / 2;
      const spacing = getResponsiveSpacing(width);
      // Explicit type for 's' to satisfy strict mode
      const conf = STRING_CONFIGS.find((s: NoteConfig) => s.stringId === note.stringId);
      if (!conf) return null;
      const direction = conf.hand === 'G' ? -1 : 1;
      const x = centerX + (direction * conf.index * spacing);
      const y = CANVAS_PADDING_TOP + ((note.tick - baseTickOffset) * TICK_HEIGHT) - scrollTop;
      return { x, y };
  };

  const findNoteAtPosition = (x: number, y: number, width: number, scrollTop: number) => {
      const centerX = width / 2;

      for (let i = data.length - 1; i >= 0; i--) {
          const note = data[i];

          if (note.stringId === 'TEXTE' && note.message) {
              const yPos = CANVAS_PADDING_TOP + ((note.tick - baseTickOffset) * TICK_HEIGHT) - scrollTop;
              const estimatedWidth = (note.message.length * 8) + 24;
              const estimatedHeight = 24;
              const halfWidth = estimatedWidth / 2;
              
              const rectLeft = centerX - halfWidth;
              const rectRight = centerX + halfWidth;
              const rectTop = yPos - 26;
              const rectBottom = yPos - 2;

              if (x >= rectLeft && x <= rectRight && y >= rectTop && y <= rectBottom) {
                  return note;
              }
          } 
          else {
              const pos = getNotePosition(note, width, scrollTop);
              if (!pos) continue;
              const dx = x - pos.x;
              const dy = y - pos.y;
              if (dx*dx + dy*dy < HIT_RADIUS*HIT_RADIUS) return note;
          }
      }
      return null;
  };

  const findStringAtX = (x: number, width: number) => {
     const centerX = width / 2;
     const spacing = getResponsiveSpacing(width);
     let closestString = STRING_CONFIGS[0];
     let minDist = Infinity;

     // Explicit type for 's'
     STRING_CONFIGS.forEach((s: NoteConfig) => {
         const direction = s.hand === 'G' ? -1 : 1;
         const sx = centerX + (direction * s.index * spacing);
         const dist = Math.abs(x - sx);
         if (dist < minDist) {
             minDist = dist;
             closestString = s;
         }
     });
     if (minDist < spacing * 0.8) return closestString.stringId;
     return null;
  };

  const processAutoScroll = (timestamp: number) => {
      if (autoScrollSpeedRef.current !== 0 && containerRef.current) {
          const delta = timestamp - lastFrameTimeRef.current;
          lastFrameTimeRef.current = timestamp;
          const scrollAmount = autoScrollSpeedRef.current * (delta / 16);
          containerRef.current.scrollTop += scrollAmount;
      }
      autoScrollReqRef.current = requestAnimationFrame(processAutoScroll);
  };

  const startAutoScroll = () => {
      if (autoScrollReqRef.current === null) {
          lastFrameTimeRef.current = performance.now();
          autoScrollReqRef.current = requestAnimationFrame(processAutoScroll);
      }
  };

  const stopAutoScroll = () => {
      if (autoScrollReqRef.current !== null) {
          cancelAnimationFrame(autoScrollReqRef.current);
          autoScrollReqRef.current = null;
      }
      autoScrollSpeedRef.current = 0;
  };

  const handleGlobalMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const { x, y } = getCanvasCoordinates(e);
      const width = canvas.width;
      const scrollTop = container.scrollTop;
      
      interactionRef.current.currentX = x;
      interactionRef.current.currentY = y;

      const dx = x - interactionRef.current.startX;
      const dy = y - interactionRef.current.startY;
      const dist = Math.abs(dx) + Math.abs(dy);

      if (interactionRef.current.mode === 'BOX_SELECT' || interactionRef.current.mode === 'DRAG_NOTE') {
          const rect = container.getBoundingClientRect();
          const mouseY = e.clientY;
          const topThreshold = rect.top + 50;
          const bottomThreshold = rect.bottom - 50;

          let speed = 0;
          if (mouseY < topThreshold) {
              speed = -5;
          } else if (mouseY > bottomThreshold) {
              speed = 5;
          }

          if (speed !== 0) {
              autoScrollSpeedRef.current = speed;
              startAutoScroll();
          } else {
              autoScrollSpeedRef.current = 0;
          }
      }

      if (interactionRef.current.mode === 'POTENTIAL_LEFT_BG') {
          if (dist > 10) {
              interactionRef.current.mode = 'BOX_SELECT';
          }
      }

      if (interactionRef.current.mode === 'BOX_SELECT') {
          const startYAbs = (interactionRef.current.startY + interactionRef.current.startScrollTop - CANVAS_PADDING_TOP);
          const currentYAbs = (y + scrollTop - CANVAS_PADDING_TOP);
          
          const startTick = Math.max(0, (startYAbs / TICK_HEIGHT) + baseTickOffset);
          const currentTickMouse = Math.max(0, (currentYAbs / TICK_HEIGHT) + baseTickOffset);
          
          const minTick = Math.min(startTick, currentTickMouse);
          const maxTick = Math.max(startTick, currentTickMouse);
          
          const rectX = Math.min(interactionRef.current.startX, x);
          const rectW = Math.abs(x - interactionRef.current.startX);

          interactionRef.current.selectionRect = { 
              startTick: minTick, 
              endTick: maxTick, 
              startX: rectX, 
              endX: rectX + rectW 
          };

          const newSelectedIds: string[] = [];
          data.forEach(note => {
              if (note.tick >= minTick && note.tick <= maxTick) {
                  const pos = getNotePosition(note, width, 0); 
                  if (pos && pos.x >= rectX && pos.x <= rectX + rectW) {
                       newSelectedIds.push(note.id);
                  }
              }
          });
          setDragSelectedIds(newSelectedIds);
          dragSelectedIdsRef.current = newSelectedIds;
      }

      if (interactionRef.current.mode === 'DRAG_NOTE' && interactionRef.current.activeNote) {
           const yAbsolute = y + scrollTop - CANVAS_PADDING_TOP;
           const rawTick = Math.max(0, (yAbsolute / TICK_HEIGHT) + baseTickOffset);
           const snapStep = 1.5; 
           let snappedTick = Math.round(rawTick / snapStep) * snapStep;
           if (snappedTick < TICKS_COUNT_IN) snappedTick = TICKS_COUNT_IN;
           
           hoveredTickRef.current = snappedTick;
      }
  };

  const handleGlobalUp = (e: MouseEvent) => {
      stopAutoScroll();
      
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const { x, y } = getCanvasCoordinates(e);
      const dist = Math.abs(x - interactionRef.current.startX) + Math.abs(y - interactionRef.current.startY);

      const mode = interactionRef.current.mode;

      if (mode === 'BOX_SELECT') {
          if (dragSelectedIdsRef.current.length > 0 && onMultiSelectionEnd) {
              onMultiSelectionEnd(dragSelectedIdsRef.current, e.clientX, e.clientY);
          }
          setDragSelectedIds([]);
          dragSelectedIdsRef.current = [];
      } 
      else if (mode === 'DRAG_NOTE') {
          if (interactionRef.current.activeNote && onNoteDrag) {
              const finalX = interactionRef.current.currentX;
              const scrollTop = container.scrollTop;
              const yAbsolute = interactionRef.current.currentY + scrollTop - CANVAS_PADDING_TOP;
              const rawTick = Math.max(0, (yAbsolute / TICK_HEIGHT) + baseTickOffset);
              
              let snappedTick = Math.round(rawTick / 1.5) * 1.5;
              if (snappedTick < TICKS_COUNT_IN) snappedTick = TICKS_COUNT_IN;

              const targetString = findStringAtX(finalX, canvas.width);

              if (dist < 10) {
                  const note = interactionRef.current.activeNote;
                  if (onNoteClick) onNoteClick(note, e.clientX, e.clientY);
              } else {
                  if (interactionRef.current.activeNote.stringId === 'TEXTE') {
                      if (snappedTick !== interactionRef.current.activeNoteOriginalTick) {
                          onNoteDrag(interactionRef.current.activeNote, 'TEXTE', snappedTick);
                      }
                  } else if (targetString && (targetString !== interactionRef.current.activeNoteOriginalString || snappedTick !== interactionRef.current.activeNoteOriginalTick)) {
                      onNoteDrag(interactionRef.current.activeNote, targetString, snappedTick);
                  }
              }
          }
      }
      else if (mode === 'POTENTIAL_LEFT_BG') {
          const scrollTop = container.scrollTop;
          const yAbsolute = y + scrollTop - CANVAS_PADDING_TOP;
          const rawTick = Math.max(0, (yAbsolute / TICK_HEIGHT) + baseTickOffset);
          const clickTick = Math.round(rawTick / 1.5) * 1.5;
          if (onSeek) onSeek(clickTick);
      }

      interactionRef.current = {
          mode: 'IDLE',
          startX: 0, startY: 0, startScrollTop: 0, currentX: 0, currentY: 0,
          activeNote: null, activeNoteOriginalString: null, activeNoteOriginalTick: 0,
          selectionRect: null
      };
      setDragSelectedIds([]);
      dragSelectedIdsRef.current = [];
      hoveredTickRef.current = null;
  };

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      if (!('touches' in e)) {
          window.addEventListener('mousemove', handleGlobalMove);
          window.addEventListener('mouseup', handleGlobalUp);
      }

      const { x, y } = getCanvasCoordinates(e);
      const scrollTop = container.scrollTop;
      const note = findNoteAtPosition(x, y, canvas.width, scrollTop);
      
      const isTouch = 'touches' in e;
      const isRightClick = !isTouch && ('button' in e && (e as React.MouseEvent).button === 2);

      const baseState = {
          startX: x, startY: y, startScrollTop: scrollTop, currentX: x, currentY: y,
          activeNote: null, activeNoteOriginalString: null, activeNoteOriginalTick: 0,
          selectionRect: null
      };

      if (note) {
          if (isRightClick) {
               if(onNoteContextMenu) onNoteContextMenu(note, (e as React.MouseEvent).clientX, (e as React.MouseEvent).clientY);
          } else {
              interactionRef.current = {
                  ...baseState,
                  mode: 'DRAG_NOTE',
                  activeNote: note,
                  activeNoteOriginalString: note.stringId,
                  activeNoteOriginalTick: note.tick,
              };
          }
      } else {
          if (isRightClick) {
              interactionRef.current = { ...baseState, mode: 'POTENTIAL_RIGHT_BG' };
          } else {
              interactionRef.current = { ...baseState, mode: 'POTENTIAL_LEFT_BG' };
          }
          setDragSelectedIds([]);
          dragSelectedIdsRef.current = [];
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
       handlePointerMove(e);
  };
  
  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const { x, y } = getCanvasCoordinates(e);
      const scrollTop = container.scrollTop;
      const isTouch = 'touches' in e;

      if (!isTouch && interactionRef.current.mode === 'IDLE') {
          const yAbsolute = y + scrollTop - CANVAS_PADDING_TOP;
          const rawTick = Math.max(0, (yAbsolute / TICK_HEIGHT) + baseTickOffset);
          const snappedTick = Math.round(rawTick / 1.5) * 1.5;
          
          if (snappedTick >= TICKS_COUNT_IN) {
              hoveredGridTickRef.current = snappedTick;
          } else {
              hoveredGridTickRef.current = null;
          }
          
          const note = findNoteAtPosition(x, y, canvas.width, scrollTop);
          if (onNoteHover) {
              onNoteHover(note || null, (e as React.MouseEvent).clientX, (e as React.MouseEvent).clientY);
          }
      } else {
          hoveredGridTickRef.current = null;
      }
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      
      if (interactionRef.current.mode === 'POTENTIAL_RIGHT_BG') {
           const { x, y } = getCanvasCoordinates(e);
           const scrollTop = container.scrollTop;
           const yAbsolute = y + scrollTop - CANVAS_PADDING_TOP;
           const rawTick = Math.max(0, (yAbsolute / TICK_HEIGHT) + baseTickOffset);
           const clickTick = Math.round(rawTick / 1.5) * 1.5;
           
           if (clickTick >= TICKS_COUNT_IN) {
             const targetString = findStringAtX(x, canvas.width) || undefined;
             let clientX, clientY;
             if('touches' in e) { clientX=e.changedTouches[0].clientX; clientY=e.changedTouches[0].clientY; }
             else { clientX=(e as React.MouseEvent).clientX; clientY=(e as React.MouseEvent).clientY; }

             if (onBackgroundClick) {
                 onBackgroundClick(clickTick, targetString, clientX, clientY);
             }
           }
           interactionRef.current.mode = 'IDLE';
      }
  };


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationId: number;

    const render = () => {
      if (containerRef.current) {
        const desiredWidth = containerRef.current.clientWidth;
        const desiredHeight = containerRef.current.clientHeight;
        if (canvas.width !== desiredWidth) canvas.width = desiredWidth;
        if (canvas.height !== desiredHeight) canvas.height = desiredHeight;
      }
      
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      
      let scrollTop = 0;
      if (isExporting || playbackState === PlaybackState.PLAYING) {
          const renderTick = playbackState === PlaybackState.PLAYING ? audioEngine.getCurrentTick() : currentTick;
          scrollTop = (renderTick - PLAYHEAD_OFFSET_TICKS - baseTickOffset) * TICK_HEIGHT;
      } else {
          scrollTop = containerRef.current ? containerRef.current.scrollTop : 0;
      }

      const scrollY = scrollTop;
      const STRING_SPACING = getResponsiveSpacing(width);
      const GRID_HALF_WIDTH = 6.5 * STRING_SPACING;
      const gridLeft = centerX - GRID_HALF_WIDTH;
      const gridRight = centerX + GRID_HALF_WIDTH;

      ctx.clearRect(0, 0, width, height);

      const bgFadePx = 30; 
      const bgMarginPx = 60; 
      
      const bgLeft = gridLeft - bgMarginPx;
      const bgWidth = (gridRight - gridLeft) + (bgMarginPx * 2);
      
      const gradient = ctx.createLinearGradient(bgLeft, 0, bgLeft + bgWidth, 0);
      
      const startSolid = bgFadePx / bgWidth;
      const endSolid = 1 - (bgFadePx / bgWidth);
      
      gradient.addColorStop(0, 'rgba(229, 196, 161, 0)');
      gradient.addColorStop(startSolid, 'rgba(229, 196, 161, 1)');
      gradient.addColorStop(endSolid, 'rgba(229, 196, 161, 1)');
      gradient.addColorStop(1, 'rgba(229, 196, 161, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(bgLeft, 0, bgWidth, height);
      
      if (interactionRef.current.mode === 'DRAG_NOTE' && hoveredTickRef.current !== null) {
          const y = CANVAS_PADDING_TOP + ((hoveredTickRef.current - baseTickOffset) * TICK_HEIGHT) - scrollY;
          ctx.fillStyle = 'rgba(255, 215, 0, 0.3)'; 
          ctx.fillRect(gridLeft, y - TICK_HEIGHT/2, gridRight - gridLeft, TICK_HEIGHT);
      }
      else if (hoveredGridTickRef.current !== null) {
          const y = CANVAS_PADDING_TOP + ((hoveredGridTickRef.current - baseTickOffset) * TICK_HEIGHT) - scrollY;
          ctx.fillStyle = '#000000'; 
          ctx.fillRect(gridLeft, y - 1, gridRight - gridLeft, 2);
      }

      const visibleHeight = height;
      const startTickRel = Math.floor((scrollY - CANVAS_PADDING_TOP) / TICK_HEIGHT); 
      const startTick = startTickRel + baseTickOffset; 
      
      const endTick = startTick + Math.ceil(visibleHeight / TICK_HEIGHT) + 20;
      const beatStart = Math.floor(startTick / 12) * 12;
      const beatEnd = Math.ceil(endTick / 12) * 12;
      const beatsPerMeasure = rhythmMode === 'binary' ? 4 : 3;

      ctx.lineWidth = 1;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      
      for (let t = beatStart; t <= beatEnd; t += 12) {
           const y = CANVAS_PADDING_TOP + ((t - baseTickOffset) * TICK_HEIGHT) - scrollY;
           
           if (y >= -10 && y <= height + 10) {
               ctx.beginPath(); ctx.moveTo(gridLeft, y); ctx.lineTo(gridRight, y);
               ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 1.5; ctx.stroke();
               
               let label = "";
               if (t >= TICKS_COUNT_IN) {
                   const measureIndex = Math.floor((t - TICKS_COUNT_IN) / (12 * beatsPerMeasure)) + 1;
                   const beatInMeasure = (Math.floor((t - TICKS_COUNT_IN) / 12) % beatsPerMeasure) + 1;
                   label = `${beatInMeasure}`;
                   
                   ctx.font = '10px sans-serif'; 
                   
                   if (beatInMeasure === 1) {
                        ctx.fillStyle = '#8d6e63';
                        ctx.fillText(`M${measureIndex}`, gridLeft - 25, y);
                   }
                   ctx.fillStyle = '#5d4037'; 
                   ctx.fillText(label, gridLeft - 10, y);
               }
           }
           
           const drawSubLine = (offset: number, type: 'half' | 'quarter' | 'eighth', label: string) => {
               const ty = y + (offset * TICK_HEIGHT);
               if (ty < -10 || ty > height + 10) return;
               ctx.beginPath(); ctx.moveTo(gridLeft, ty); ctx.lineTo(gridRight, ty);
               
               ctx.strokeStyle = '#8d6e63';
               ctx.lineWidth = 1;

               if (type === 'half') {
                   ctx.setLineDash([]);
               } else if (type === 'quarter') {
                   ctx.setLineDash([1, 6]);
               } else if (type === 'eighth') {
                   ctx.setLineDash([1, 2]);
               }

               ctx.stroke(); ctx.setLineDash([]);
               
               if(label && t >= TICKS_COUNT_IN) { 
                   ctx.fillStyle = '#5d4037'; 
                   ctx.textAlign = 'right';
                   ctx.font = '9px sans-serif'; 
                   ctx.fillText(label, gridLeft - 10, ty); 
               }
           }
           
           drawSubLine(6, 'half', "1/2");
           drawSubLine(3, 'quarter', "1/4"); drawSubLine(9, 'quarter', "1/4");
           drawSubLine(1.5, 'eighth', "1/8"); drawSubLine(4.5, 'eighth', "1/8"); drawSubLine(7.5, 'eighth', "1/8"); drawSubLine(10.5, 'eighth', "1/8");
      }

      // Explicit type for 's'
      STRING_CONFIGS.forEach((s: NoteConfig) => {
          const direction = s.hand === 'G' ? -1 : 1;
          const x = centerX + (direction * s.index * STRING_SPACING);
          const currentNote = tuning[s.stringId] || s.note;
          const noteColor = NOTE_COLORS[currentNote.charAt(0)] || '#999';
          ctx.beginPath(); ctx.strokeStyle = noteColor; ctx.lineWidth = 2;
          ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      });
      ctx.beginPath(); ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2;
      ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height); ctx.stroke();

      data.forEach(note => {
          if (note.tick < startTick - 5 || note.tick > endTick + 5) return;
          
          if (note.stringId === 'TEXTE' && note.message) {
              const y = CANVAS_PADDING_TOP + ((note.tick - baseTickOffset) * TICK_HEIGHT) - scrollY;
              
              ctx.save(); ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
              const textWidth = ctx.measureText(note.message).width;
              
              ctx.fillStyle = '#e5c4a1'; 
              ctx.strokeStyle = '#8d6e63'; 
              ctx.lineWidth = 2;

              const rectX = centerX - textWidth/2 - 12;
              const rectY = y - 26;
              const rectW = textWidth + 24;
              const rectH = 24;
              const radius = 6;

              ctx.beginPath();
              ctx.moveTo(rectX + radius, rectY);
              ctx.lineTo(rectX + rectW - radius, rectY);
              ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + radius);
              ctx.lineTo(rectX + rectW, rectY + rectH - radius);
              ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - radius, rectY + rectH);
              ctx.lineTo(rectX + radius, rectY + rectH);
              ctx.quadraticCurveTo(rectX, rectY, rectX, rectY + rectH - radius);
              ctx.lineTo(rectX, rectY + radius);
              ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
              ctx.closePath();
              
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = '#5d4037'; 
              ctx.fillText(note.message, centerX, y - 9);
              ctx.restore();
              return;
          }

          let displayStringId = note.stringId;
          let displayTick = note.tick;
          let isBeingDragged = false;
          
          if (interactionRef.current.mode === 'DRAG_NOTE' && interactionRef.current.activeNote?.id === note.id) {
              const targetString = findStringAtX(interactionRef.current.currentX, width);
              if (targetString && note.stringId !== 'TEXTE') displayStringId = targetString;
              const yAbsolute = interactionRef.current.currentY + scrollTop - CANVAS_PADDING_TOP;
              const rawTick = Math.max(0, (yAbsolute / TICK_HEIGHT) + baseTickOffset);
              displayTick = Math.round(rawTick / 1.5) * 1.5;
              if (displayTick < TICKS_COUNT_IN) displayTick = TICKS_COUNT_IN;
              isBeingDragged = true;
          }

          // Explicit type for 's'
          const conf = STRING_CONFIGS.find((s: NoteConfig) => s.stringId === displayStringId);
          if (!conf) return;
          const direction = conf.hand === 'G' ? -1 : 1;
          const x = centerX + (direction * conf.index * STRING_SPACING);
          const y = CANVAS_PADDING_TOP + ((displayTick - baseTickOffset) * TICK_HEIGHT) - scrollY;

          if (isBeingDragged) {
               const origConf = STRING_CONFIGS.find((s: NoteConfig) => s.stringId === note.stringId);
               if(origConf) {
                   const ox = centerX + ((origConf.hand === 'G' ? -1 : 1) * origConf.index * STRING_SPACING);
                   const oy = CANVAS_PADDING_TOP + ((note.tick - baseTickOffset) * TICK_HEIGHT) - scrollY;
                   ctx.beginPath(); ctx.arc(ox, oy, NOTE_RADIUS, 0, Math.PI*2); ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fill();
               }
          }

          const radius = isBeingDragged ? NOTE_RADIUS * 1.3 : NOTE_RADIUS;
          const actualNoteName = tuning[displayStringId] || conf.note;
          const noteColor = NOTE_COLORS[actualNoteName.charAt(0)] || '#555';

          const isSelected = selectedNoteId === note.id || selectedNoteIds.includes(note.id) || dragSelectedIds.includes(note.id);
          
          if (isSelected) {
              ctx.save();
              ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10;
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
              ctx.beginPath(); ctx.arc(x, y, radius + 2, 0, Math.PI * 2); ctx.stroke();
              ctx.restore();
          }

          ctx.beginPath(); ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = noteColor; ctx.fill();
          
          ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(x - radius*0.3, y - radius*0.3, radius*0.1, x, y, radius);
          grad.addColorStop(0, 'rgba(255,255,255,0.8)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grad; ctx.fill();

          ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke();

          if (note.doigt) {
              const badgeX = x - radius - 16;
              ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              const emoji = note.doigt === 'P' ? '👍' : '☝️';
              ctx.lineWidth = 4; ctx.strokeStyle = '#e5c4a1'; ctx.strokeText(emoji, badgeX, y+2);
              ctx.fillStyle = '#5d4037'; ctx.fillText(emoji, badgeX, y+2);
          }
      });

      if (interactionRef.current.mode === 'BOX_SELECT' && interactionRef.current.selectionRect) {
          const { startTick, endTick, startX, endX } = interactionRef.current.selectionRect;
          
          const y1 = CANVAS_PADDING_TOP + ((startTick - baseTickOffset) * TICK_HEIGHT) - scrollY;
          const y2 = CANVAS_PADDING_TOP + ((endTick - baseTickOffset) * TICK_HEIGHT) - scrollY;
          const rectX = startX;
          const rectW = endX - startX;
          const rectH = y2 - y1;

          ctx.save();
          ctx.fillStyle = 'rgba(166, 124, 82, 0.3)';
          ctx.strokeStyle = '#A67C52';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.fillRect(rectX, y1, rectW, rectH);
          ctx.strokeRect(rectX, y1, rectW, rectH);
          ctx.restore();
      }

      let renderTick = currentTick;
      if (playbackState === PlaybackState.PLAYING) renderTick = audioEngine.getCurrentTick();
      
      const cursorY = CANVAS_PADDING_TOP + ((renderTick - baseTickOffset) * TICK_HEIGHT) - scrollY;
      
      if (cursorY >= -10 && cursorY <= height + 10) {
           ctx.shadowBlur = 10; ctx.shadowColor = '#d97706';
           ctx.strokeStyle = 'rgba(251, 191, 36, 1)'; 
           ctx.lineWidth = 4.5;
           ctx.beginPath(); ctx.moveTo(gridLeft - 20, cursorY); ctx.lineTo(gridRight + 20, cursorY); ctx.stroke();
           ctx.shadowBlur = 0;
           ctx.fillStyle = '#f59e0b'; ctx.beginPath(); 
           ctx.moveTo(centerX, cursorY-10); 
           ctx.lineTo(centerX+10, cursorY); 
           ctx.lineTo(centerX, cursorY+10); 
           ctx.lineTo(centerX-10, cursorY); 
           ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationId);
  }, [data, currentTick, tuning, rhythmMode, playbackState, isExporting, onNoteClick, onNoteDrag, onNoteHover, selectedNoteId, selectedNoteIds, dragSelectedIds, onBackgroundClick, onDeleteNote, onSeek, onNoteContextMenu, baseTickOffset]);

  return (
    <div ref={containerRef} className="w-full h-full bg-transparent overflow-y-auto custom-scrollbar relative select-none scrollbar-hide">
      <div style={{ height: contentHeight, width: '100%' }} className="absolute top-0 left-0 pointer-events-none"></div>
      <canvas 
        ref={canvasRef} 
        className="sticky top-0 left-0 block cursor-pointer"
        onContextMenu={handleContextMenu}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={() => { if(onNoteHover) onNoteHover(null, 0, 0); }}
        onTouchStart={handlePointerDown}
        onTouchMove={handleTouchMove}
        onTouchEnd={handlePointerUp}
      />
    </div>
  );
});

export default Visualizer;
