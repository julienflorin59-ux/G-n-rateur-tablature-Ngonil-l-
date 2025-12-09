import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import { ParsedNote, Tuning, PlaybackState } from '../types';
import { STRING_CONFIGS, NOTE_COLORS, ASSETS_BASE_URL } from '../constants';
import { audioEngine } from '../utils/audio';

interface VisualizerProps {
  data: ParsedNote[];
  currentTick: number;
  tuning: Tuning;
  rhythmMode: 'binary' | 'ternary';
  playbackState: PlaybackState;
  isExporting?: boolean; // New prop to signal export mode
  onNoteClick?: (note: ParsedNote, x: number, y: number) => void;
  onNoteDrag?: (note: ParsedNote, newStringId: string, newTick: number) => void;
  onNoteHover?: (note: ParsedNote | null, x: number, y: number) => void;
  selectedNoteId?: string | null;
  selectedNoteIds?: string[]; // New: For multi-selection
  onBackgroundClick?: (tick: number, stringId: string | undefined, x: number, y: number) => void;
  onDeleteNote?: (note: ParsedNote) => void;
  onSeek?: (tick: number) => void;
  onNoteContextMenu?: (note: ParsedNote, x: number, y: number) => void;
  onMultiSelectionEnd?: (selectedIds: string[], x: number, y: number) => void; // New callback
}

export interface VisualizerHandle {
  getCanvasStream: () => MediaStream | null;
  scrollToBottom: () => void;
}

// Dimensions and constants
const NOTE_RADIUS = 7;
const HIT_RADIUS = 15;
const TICK_HEIGHT = 8;
// Reduced padding to minimize gap below StringPad buttons (was 156)
const CANVAS_PADDING_TOP = 80; 

const Visualizer = forwardRef<VisualizerHandle, VisualizerProps>(({ 
  data, currentTick, tuning, rhythmMode, playbackState, isExporting,
  onNoteClick, onNoteDrag, onNoteHover, selectedNoteId, selectedNoteIds = [],
  onBackgroundClick, onDeleteNote, onSeek, onNoteContextMenu, onMultiSelectionEnd 
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textureRef = useRef<HTMLImageElement | null>(null);
  const [textureLoaded, setTextureLoaded] = useState(false);

  // Interaction State
  const interactionRef = useRef<{
    mode: 'IDLE' | 'DRAG_NOTE' | 'POTENTIAL_LEFT_BG' | 'POTENTIAL_RIGHT_BG' | 'BOX_SELECT';
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    activeNote: ParsedNote | null;
    activeNoteOriginalString: string | null;
    activeNoteOriginalTick: number;
    selectionRect: { x: number, y: number, w: number, h: number } | null;
  }>({
    mode: 'IDLE',
    startX: 0, startY: 0, currentX: 0, currentY: 0,
    activeNote: null, activeNoteOriginalString: null, activeNoteOriginalTick: 0,
    selectionRect: null
  });

  const hoveredTickRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number, x: number, y: number } | null>(null);
  
  // Local state for immediate visual feedback of multi-selection during drag
  const [dragSelectedIds, setDragSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = `${ASSETS_BASE_URL}texture_ngonilele.png`;
    img.onload = () => {
      textureRef.current = img;
      setTextureLoaded(true);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    getCanvasStream: () => {
      // FIX: Reduce FPS to 30 for stability during export. 
      // This matches typical video framerates and reduces CPU load preventing stutter.
      if (canvasRef.current) return canvasRef.current.captureStream(30);
      return null;
    },
    scrollToBottom: () => {
      if (containerRef.current) {
        containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
      }
    }
  }));

  // Auto-Scroll Logic - Only touches DOM if NOT exporting (during export we handle scroll mathematically)
  useEffect(() => {
    if (playbackState === PlaybackState.PLAYING && containerRef.current && !isExporting) {
       containerRef.current.scrollTop = currentTick * TICK_HEIGHT;
    } else if (currentTick === 0 && containerRef.current && !isExporting) {
       containerRef.current.scrollTop = 0;
    }
  }, [currentTick, playbackState, isExporting]);

  // Content height calculation
  const lastNote = data.length > 0 ? data[data.length - 1] : null;
  const maxTick = lastNote ? lastNote.tick + lastNote.duration : 100;
  const contentHeight = (maxTick * TICK_HEIGHT) + 300; 

  // Helpers
  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ('changedTouches' in e) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const getResponsiveSpacing = (width: number) => {
      const responsiveSpacing = width / 14; 
      // FIX: Remove minimum clamp (30px) to allow fitting on small screens matching StringPad
      return Math.min(50, responsiveSpacing);
  };

  const getNotePosition = (note: ParsedNote, width: number, scrollTop: number) => {
      const centerX = width / 2;
      const spacing = getResponsiveSpacing(width);
      const conf = STRING_CONFIGS.find(s => s.stringId === note.stringId);
      if (!conf) return null;
      const direction = conf.hand === 'G' ? -1 : 1;
      const x = centerX + (direction * conf.index * spacing);
      const y = CANVAS_PADDING_TOP + (note.tick * TICK_HEIGHT) - scrollTop;
      return { x, y };
  };

  const findNoteAtPosition = (x: number, y: number, width: number, scrollTop: number) => {
      for (let i = data.length - 1; i >= 0; i--) {
          const note = data[i];
          const pos = getNotePosition(note, width, scrollTop);
          if (!pos) continue;
          const dx = x - pos.x;
          const dy = y - pos.y;
          if (dx*dx + dy*dy < HIT_RADIUS*HIT_RADIUS) return note;
      }
      return null;
  };

  const findStringAtX = (x: number, width: number) => {
     const centerX = width / 2;
     const spacing = getResponsiveSpacing(width);
     let closestString = STRING_CONFIGS[0];
     let minDist = Infinity;

     STRING_CONFIGS.forEach(s => {
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

  // --- EVENT HANDLERS ---
  // (Interaction handlers omitted for brevity as they are unchanged)
  // ... Keep existing interaction logic exactly as is ...
  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const { x, y } = getCanvasCoordinates(e);
      const scrollTop = container.scrollTop;
      const note = findNoteAtPosition(x, y, canvas.width, scrollTop);
      
      const isTouch = 'touches' in e;
      const isRightClick = !isTouch && ('button' in e && (e as React.MouseEvent).button === 2);

      if (note) {
          interactionRef.current = {
              mode: 'DRAG_NOTE',
              startX: x, startY: y, currentX: x, currentY: y,
              activeNote: note,
              activeNoteOriginalString: note.stringId,
              activeNoteOriginalTick: note.tick,
              selectionRect: null
          };
      } else {
          if (isRightClick) {
              interactionRef.current = {
                  mode: 'POTENTIAL_RIGHT_BG',
                  startX: x, startY: y, currentX: x, currentY: y,
                  activeNote: null, activeNoteOriginalString: null, activeNoteOriginalTick: 0,
                  selectionRect: null
              };
          } else {
              interactionRef.current = {
                  mode: 'POTENTIAL_LEFT_BG',
                  startX: x, startY: y, currentX: x, currentY: y,
                  activeNote: null, activeNoteOriginalString: null, activeNoteOriginalTick: 0,
                  selectionRect: null
              };
          }
          setDragSelectedIds([]);
      }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const { x, y } = getCanvasCoordinates(e);
      const width = canvas.width;
      const scrollTop = container.scrollTop;
      const isTouch = 'touches' in e;

      interactionRef.current.currentX = x;
      interactionRef.current.currentY = y;

      const dx = x - interactionRef.current.startX;
      const dy = y - interactionRef.current.startY;
      const dist = Math.abs(dx) + Math.abs(dy);

      if (interactionRef.current.mode === 'POTENTIAL_RIGHT_BG') {
          if (dist > 10) {
              interactionRef.current.mode = 'BOX_SELECT';
          }
      }

      if (interactionRef.current.mode === 'BOX_SELECT') {
          e.preventDefault();
          const rectX = Math.min(interactionRef.current.startX, x);
          const rectY = Math.min(interactionRef.current.startY, y);
          const rectW = Math.abs(x - interactionRef.current.startX);
          const rectH = Math.abs(y - interactionRef.current.startY);
          
          interactionRef.current.selectionRect = { x: rectX, y: rectY, w: rectW, h: rectH };

          const newSelectedIds: string[] = [];
          data.forEach(note => {
              const pos = getNotePosition(note, width, scrollTop);
              if (pos) {
                  if (pos.x >= rectX && pos.x <= rectX + rectW &&
                      pos.y >= rectY && pos.y <= rectY + rectH) {
                      newSelectedIds.push(note.id);
                  }
              }
          });
          setDragSelectedIds(newSelectedIds);
      }

      if (interactionRef.current.mode === 'DRAG_NOTE' && interactionRef.current.activeNote) {
           e.preventDefault();
           const yAbsolute = y + scrollTop - CANVAS_PADDING_TOP;
           const rawTick = Math.max(0, yAbsolute / TICK_HEIGHT);
           const snapStep = 1.5; 
           let snappedTick = Math.round(rawTick / snapStep) * snapStep;
           hoveredTickRef.current = snappedTick;
      }

      if (interactionRef.current.mode === 'IDLE' && !isTouch) {
          const note = findNoteAtPosition(x, y, width, scrollTop);
          if (onNoteHover) {
              onNoteHover(note || null, (e as React.MouseEvent).clientX, (e as React.MouseEvent).clientY);
          }
      }
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const { x, y } = getCanvasCoordinates(e);
      let clientX, clientY;
      if ('changedTouches' in e) {
           clientX = e.changedTouches[0].clientX;
           clientY = e.changedTouches[0].clientY;
      } else {
           clientX = (e as React.MouseEvent).clientX;
           clientY = (e as React.MouseEvent).clientY;
      }

      const isTouch = 'changedTouches' in e;
      const isRightClick = !isTouch && ('button' in e && (e as React.MouseEvent).button === 2);
      
      const mode = interactionRef.current.mode;

      if (mode === 'BOX_SELECT') {
          if (dragSelectedIds.length > 0 && onMultiSelectionEnd) {
              onMultiSelectionEnd(dragSelectedIds, clientX, clientY);
          }
          setDragSelectedIds([]);
      } 
      else if (mode === 'DRAG_NOTE') {
          if (interactionRef.current.activeNote && onNoteDrag) {
              const width = canvas.width;
              const scrollTop = container.scrollTop;
              
              const finalY = interactionRef.current.currentY;
              const finalX = interactionRef.current.currentX;
              const yAbsolute = finalY + scrollTop - CANVAS_PADDING_TOP;
              const rawTick = Math.max(0, yAbsolute / TICK_HEIGHT);
              const snappedTick = Math.round(rawTick / 1.5) * 1.5;
              const targetString = findStringAtX(finalX, width);

              const dist = Math.abs(finalX - interactionRef.current.startX) + Math.abs(finalY - interactionRef.current.startY);

              if (dist < 10) {
                  const note = interactionRef.current.activeNote;
                  let isContextMenuAction = isRightClick;
                  if (isTouch) {
                      const now = Date.now();
                      if (lastTapRef.current) {
                          const timeDiff = now - lastTapRef.current.time;
                          const tapDist = Math.abs(x - lastTapRef.current.x) + Math.abs(y - lastTapRef.current.y);
                          if (timeDiff < 300 && tapDist < 20) {
                              isContextMenuAction = true;
                              lastTapRef.current = null;
                          } else {
                              lastTapRef.current = { time: now, x, y };
                          }
                      } else {
                          lastTapRef.current = { time: now, x, y };
                      }
                  }

                  if (isContextMenuAction && onNoteContextMenu) {
                      onNoteContextMenu(note, clientX, clientY);
                  } else if (onNoteClick) {
                      onNoteClick(note, clientX, clientY);
                  }
              } else {
                  if (targetString && (targetString !== interactionRef.current.activeNoteOriginalString || snappedTick !== interactionRef.current.activeNoteOriginalTick)) {
                      onNoteDrag(interactionRef.current.activeNote, targetString, snappedTick);
                  }
              }
          }
      } 
      else if (mode === 'POTENTIAL_RIGHT_BG') {
          const scrollTop = container.scrollTop;
          const yAbsolute = y + scrollTop - CANVAS_PADDING_TOP;
          const rawTick = Math.max(0, yAbsolute / TICK_HEIGHT);
          const fullBeatTick = Math.round(rawTick / 12) * 12;
          const targetString = findStringAtX(x, canvas.width) || undefined;
          if (onBackgroundClick) {
              onBackgroundClick(fullBeatTick, targetString, clientX, clientY);
          }
      }
      else if (mode === 'POTENTIAL_LEFT_BG') {
           let isDoubleTap = false;
           if (isTouch) {
              const now = Date.now();
              if (lastTapRef.current) {
                          const timeDiff = now - lastTapRef.current.time;
                  const tapDist = Math.abs(x - lastTapRef.current.x) + Math.abs(y - lastTapRef.current.y);
                  if (timeDiff < 300 && tapDist < 20) {
                      isDoubleTap = true;
                      lastTapRef.current = null;
                  } else {
                      lastTapRef.current = { time: now, x, y };
                  }
              } else {
                  lastTapRef.current = { time: now, x, y };
              }
           }

           const scrollTop = container.scrollTop;
           const yAbsolute = y + scrollTop - CANVAS_PADDING_TOP;
           const rawTick = Math.max(0, yAbsolute / TICK_HEIGHT);
           
           if (isDoubleTap) {
               const fullBeatTick = Math.round(rawTick / 12) * 12;
               const targetString = findStringAtX(x, canvas.width) || undefined;
               if (onBackgroundClick) {
                   onBackgroundClick(fullBeatTick, targetString, clientX, clientY);
               }
           } else {
               const seekTick = Math.round(rawTick / 1.5) * 1.5;
               if (onSeek) onSeek(seekTick);
           }
      }

      interactionRef.current = {
          mode: 'IDLE',
          startX: 0, startY: 0, currentX: 0, currentY: 0,
          activeNote: null, activeNoteOriginalString: null, activeNoteOriginalTick: 0,
          selectionRect: null
      };
      setDragSelectedIds([]);
  };


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationId: number;

    const render = () => {
      // Logic for Export Mode: Fixed Resolution (720p) & Mathematical Scroll
      if (isExporting) {
          // Optimized: Only set dimensions if changed to avoid unnecessary re-allocations/clearing
          if (canvas.width !== 1280) canvas.width = 1280;
          if (canvas.height !== 720) canvas.height = 720;
      } else {
          // Standard responsive mode
          if (containerRef.current) {
            const desiredWidth = containerRef.current.clientWidth;
            const desiredHeight = containerRef.current.clientHeight;
            // Only set if different to improve performance
            if (canvas.width !== desiredWidth) canvas.width = desiredWidth;
            if (canvas.height !== desiredHeight) canvas.height = desiredHeight;
          }
      }
      
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      
      // SYNC FIX: Determine scroll position
      let scrollTop = 0;
      if (isExporting || playbackState === PlaybackState.PLAYING) {
          // During playback/export, we calculate scroll mathematically to ensure perfect sync
          // between Audio Engine Time and Visual Grid, bypassing DOM lag.
          // This prevents stutter in the exported video.
          const renderTick = playbackState === PlaybackState.PLAYING ? audioEngine.getCurrentTick() : currentTick;
          scrollTop = renderTick * TICK_HEIGHT;
      } else {
          // While paused/editing, we rely on DOM scroll
          scrollTop = containerRef.current ? containerRef.current.scrollTop : 0;
      }

      const scrollY = scrollTop;
      const STRING_SPACING = getResponsiveSpacing(width);
      
      // CALCUL DE LA LARGEUR DE GRILLE (Pour centrer sous les notes)
      // On couvre de l'index -6 à +6 environ, soit 12 espaces. On met un peu de marge.
      const GRID_HALF_WIDTH = 6.5 * STRING_SPACING;
      const gridLeft = centerX - GRID_HALF_WIDTH;
      const gridRight = centerX + GRID_HALF_WIDTH;

      // 1. Background
      ctx.fillStyle = '#e5c4a1';
      ctx.fillRect(0, 0, width, height);

      // 2. Texture
      if (textureRef.current && textureLoaded) {
          ctx.save();
          const imgScale = 0.3;
          const imgW = width * imgScale;
          const aspect = textureRef.current.width / textureRef.current.height;
          const imgH = imgW / aspect;
          const imgX = (width - imgW) / 2;
          const imgY = CANVAS_PADDING_TOP;
          ctx.globalAlpha = 0.4;
          ctx.drawImage(textureRef.current, imgX, imgY, imgW, imgH);
          ctx.restore();
      }

      // 2.5 Highlight Bar (Hovered Tick during drag)
      if (interactionRef.current.mode === 'DRAG_NOTE' && hoveredTickRef.current !== null) {
          const y = CANVAS_PADDING_TOP + (hoveredTickRef.current * TICK_HEIGHT) - scrollY;
          ctx.fillStyle = 'rgba(255, 215, 0, 0.3)'; 
          // Constrain to grid width
          ctx.fillRect(gridLeft, y - TICK_HEIGHT/2, gridRight - gridLeft, TICK_HEIGHT);
      }

      // 3. Grid Lines
      const visibleHeight = height;
      const startTick = Math.max(0, Math.floor((scrollY - CANVAS_PADDING_TOP) / TICK_HEIGHT)); 
      const endTick = startTick + Math.ceil(visibleHeight / TICK_HEIGHT) + 20;
      const beatStart = Math.floor(startTick / 12) * 12;
      const beatEnd = Math.ceil(endTick / 12) * 12;
      const beatsPerMeasure = rhythmMode === 'binary' ? 4 : 3;

      ctx.lineWidth = 1;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right'; // Align right so text is next to the grid line
      ctx.textBaseline = 'middle';
      
      for (let t = beatStart; t <= beatEnd; t += 12) {
           const y = CANVAS_PADDING_TOP + (t * TICK_HEIGHT) - scrollY;
           if (y >= -10 && y <= height + 10) {
               ctx.beginPath(); ctx.moveTo(gridLeft, y); ctx.lineTo(gridRight, y);
               ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5; ctx.stroke();
               const beatNum = (Math.floor(t / 12) % beatsPerMeasure) + 1;
               ctx.fillStyle = '#5d4037'; 
               // Draw label to the left of gridLeft
               ctx.fillText(beatNum.toString(), gridLeft - 10, y);
           }
           const drawSubLine = (offset: number, type: 'grey' | 'tight' | 'spaced', label: string) => {
               const ty = y + (offset * TICK_HEIGHT);
               if (ty < -10 || ty > height + 10) return;
               ctx.beginPath(); ctx.moveTo(gridLeft, ty); ctx.lineTo(gridRight, ty);
               ctx.strokeStyle = type === 'grey' ? '#888' : '#8d6e63';
               ctx.lineWidth = 1;
               ctx.setLineDash(type === 'tight' ? [1,2] : (type === 'spaced' ? [1,6] : []));
               ctx.stroke(); ctx.setLineDash([]);
               if(label) { 
                   ctx.fillStyle = '#5d4037'; 
                   ctx.textAlign = 'right';
                   ctx.fillText(label, gridLeft - 10, ty); 
               }
           }
           drawSubLine(6, 'grey', "1/2");
           drawSubLine(3, 'tight', "1/4"); drawSubLine(9, 'tight', "1/4");
           drawSubLine(1.5, 'spaced', "1/8"); drawSubLine(4.5, 'spaced', "1/8"); drawSubLine(7.5, 'spaced', "1/8"); drawSubLine(10.5, 'spaced', "1/8");
      }

      // 4. Strings
      STRING_CONFIGS.forEach(s => {
          const direction = s.hand === 'G' ? -1 : 1;
          const x = centerX + (direction * s.index * STRING_SPACING);
          const currentNote = tuning[s.stringId] || s.note;
          const noteColor = NOTE_COLORS[currentNote.charAt(0)] || '#999';
          ctx.beginPath(); ctx.strokeStyle = noteColor; ctx.lineWidth = 2;
          ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      });
      ctx.beginPath(); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
      ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height); ctx.stroke();

      // 5. Notes
      data.forEach(note => {
          if (note.tick < startTick - 5 || note.tick > endTick + 5) return;
          
          if (note.stringId === 'TEXTE' && note.message) {
              const y = CANVAS_PADDING_TOP + (note.tick * TICK_HEIGHT) - scrollY;
              ctx.save(); ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
              const textWidth = ctx.measureText(note.message).width;
              ctx.fillStyle = '#e5c4a1'; ctx.fillRect(centerX - textWidth/2 - 12, y - 26, textWidth + 24, 24);
              ctx.strokeStyle = '#cbb094'; ctx.strokeRect(centerX - textWidth/2 - 12, y - 26, textWidth + 24, 24);
              ctx.fillStyle = '#5d4037'; ctx.fillText(note.message, centerX, y - 9);
              ctx.restore();
              return;
          }

          let displayStringId = note.stringId;
          let displayTick = note.tick;
          let isBeingDragged = false;
          
          if (interactionRef.current.mode === 'DRAG_NOTE' && interactionRef.current.activeNote?.id === note.id) {
              const targetString = findStringAtX(interactionRef.current.currentX, width);
              if (targetString) displayStringId = targetString;
              const yAbsolute = interactionRef.current.currentY + scrollTop - CANVAS_PADDING_TOP;
              const rawTick = Math.max(0, yAbsolute / TICK_HEIGHT);
              displayTick = Math.round(rawTick / 1.5) * 1.5;
              isBeingDragged = true;
          }

          const conf = STRING_CONFIGS.find(s => s.stringId === displayStringId);
          if (!conf) return;
          const direction = conf.hand === 'G' ? -1 : 1;
          const x = centerX + (direction * conf.index * STRING_SPACING);
          const y = CANVAS_PADDING_TOP + (displayTick * TICK_HEIGHT) - scrollY;

          if (isBeingDragged) {
               const origConf = STRING_CONFIGS.find(s => s.stringId === note.stringId);
               if(origConf) {
                   const ox = centerX + ((origConf.hand === 'G' ? -1 : 1) * origConf.index * STRING_SPACING);
                   const oy = CANVAS_PADDING_TOP + (note.tick * TICK_HEIGHT) - scrollY;
                   ctx.beginPath(); ctx.arc(ox, oy, NOTE_RADIUS, 0, Math.PI*2); ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fill();
               }
          }

          const radius = isBeingDragged ? NOTE_RADIUS * 1.3 : NOTE_RADIUS;
          const actualNoteName = tuning[displayStringId] || conf.note;
          const noteColor = NOTE_COLORS[actualNoteName.charAt(0)] || '#555';

          // SELECTION HIGHLIGHT (Single or Multi)
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

      // 6. Selection Box (Render on top)
      if (interactionRef.current.mode === 'BOX_SELECT' && interactionRef.current.selectionRect) {
          const { x, y, w, h } = interactionRef.current.selectionRect;
          ctx.save();
          ctx.fillStyle = 'rgba(166, 124, 82, 0.3)';
          ctx.strokeStyle = '#A67C52';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          ctx.restore();
      }

      // 7. Cursor (Yellow Bar)
      // When synced mathematically (isExporting or Playing), scrollY = renderTick * TICK_HEIGHT
      // Thus cursorY = CANVAS_PADDING_TOP + (renderTick * TICK_HEIGHT) - (renderTick * TICK_HEIGHT)
      // cursorY = CANVAS_PADDING_TOP.
      // This creates the perfect "fixed playhead" effect where notes scroll up.
      let renderTick = currentTick;
      if (playbackState === PlaybackState.PLAYING) renderTick = audioEngine.getCurrentTick();
      const cursorY = CANVAS_PADDING_TOP + (renderTick * TICK_HEIGHT) - scrollY;
      
      if (cursorY >= -10 && cursorY <= height + 10) {
           ctx.shadowBlur = 10; ctx.shadowColor = '#d97706';
           ctx.strokeStyle = 'rgba(251, 191, 36, 1)'; 
           ctx.lineWidth = 4.5; // Changed from 6 to 4.5 (1.5x original)
           // Constrain cursor line to just outside the grid
           ctx.beginPath(); ctx.moveTo(gridLeft - 20, cursorY); ctx.lineTo(gridRight + 20, cursorY); ctx.stroke();
           ctx.shadowBlur = 0;
           // Make center marker slightly bigger to match new thickness
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
  }, [data, currentTick, textureLoaded, tuning, rhythmMode, playbackState, isExporting, onNoteClick, onNoteDrag, onNoteHover, selectedNoteId, selectedNoteIds, dragSelectedIds, onBackgroundClick, onDeleteNote, onSeek, onNoteContextMenu]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#e5c4a1] overflow-y-auto custom-scrollbar relative select-none scrollbar-hide">
      <div style={{ height: contentHeight, width: '100%' }} className="absolute top-0 left-0 pointer-events-none"></div>
      <canvas 
        ref={canvasRef} 
        className="sticky top-0 left-0 block cursor-pointer"
        onContextMenu={handleContextMenu}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={() => { handlePointerUp({} as any); if(onNoteHover) onNoteHover(null, 0, 0); }}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      />
    </div>
  );
});

export default Visualizer;