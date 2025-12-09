import { jsPDF } from "jspdf";
import { parseTablature } from "./parser";
import { STRING_CONFIGS, NOTE_COLORS } from "../constants";
import { ParsedNote, TICKS_QUARTER } from "../types";

// Configuration de la mise en page PDF
const PAGE_WIDTH = 210; // A4 width mm
const PAGE_HEIGHT = 297; // A4 height mm
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 20;
const CENTER_X = PAGE_WIDTH / 2;

// Configuration de l'échelle Visuelle (doit matcher le Visualizer)
// Le Visualizer utilise width / 14 pour l'espacement. Sur A4 (210mm), disons width utilisable ~180mm.
const VISUAL_WIDTH_MM = 160; 
const STRING_SPACING = VISUAL_WIDTH_MM / 14; 
const TICK_SCALE = 1.5; // Hauteur par tick (mm)
const NOTE_RADIUS = 2.5; // Rayon des billes (mm)

export const generatePDF = (code: string, title: string = "Tablature Ngonilélé", scaleName: string = "") => {
    const doc = new jsPDF();
    const notes = parseTablature(code);
    
    // --- UTILS ---
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    };

    let cursorY = MARGIN_TOP;

    // Fonction pour dessiner l'en-tête de page
    const drawPageHeader = (pageIndex: number) => {
        if (pageIndex === 1) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(93, 64, 55); // #5d4037
            doc.setFontSize(22);
            doc.text(title || "Composition Ngonilélé", CENTER_X, 15, { align: "center" });
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Gamme : ${scaleName}`, CENTER_X, 22, { align: "center" });
            cursorY = 35; 
        } else {
            cursorY = MARGIN_TOP;
        }

        // Dessiner les en-têtes de cordes (Cercles colorés)
        const headerY = cursorY;
        
        STRING_CONFIGS.forEach(s => {
            const direction = s.hand === 'G' ? -1 : 1;
            const x = CENTER_X + (direction * s.index * STRING_SPACING);
            const color = hexToRgb(NOTE_COLORS[s.note.charAt(0)] || '#999999');

            // Petit cercle indicateur
            doc.setFillColor(color.r, color.g, color.b);
            doc.setDrawColor(color.r, color.g, color.b);
            doc.circle(x, headerY, 2, 'F');
            
            // Nom de la corde
            doc.setTextColor(50);
            doc.setFontSize(6);
            doc.text(s.stringId, x, headerY - 3, { align: "center" });
        });

        cursorY += 5; // Marge après le header
    };

    // --- DESSIN PRINCIPAL ---
    
    // 1. Calculer la hauteur totale
    const lastNote = notes.length > 0 ? notes[notes.length - 1] : null;
    const lastTick = lastNote ? lastNote.tick + lastNote.duration : 0;
    const totalTicks = lastTick + (TICKS_QUARTER * 2); // Un peu de marge à la fin

    let pageNum = 1;
    drawPageHeader(pageNum);

    // Fonction pour dessiner les sous-lignes (copie du Visualizer)
    const drawSubLine = (y: number, type: 'grey' | 'tight' | 'spaced', label: string) => {
        doc.setLineWidth(0.1); // Plus fin pour le PDF
        if (type === 'grey') {
            doc.setDrawColor(136, 136, 136); // #888
            doc.setLineDashPattern([], 0); // Solide
        } else if (type === 'tight') {
            doc.setDrawColor(141, 110, 99); // #8d6e63
            doc.setLineDashPattern([0.5, 0.5], 0); 
        } else {
            doc.setDrawColor(141, 110, 99);
            doc.setLineDashPattern([0.5, 2], 0);
        }
        
        // Ligne
        doc.line(CENTER_X - (7 * STRING_SPACING), y, CENTER_X + (7 * STRING_SPACING), y);
        doc.setLineDashPattern([], 0); // Reset

        // Label
        if (label) {
            doc.setFontSize(5);
            doc.setTextColor(93, 64, 55);
            doc.text(label, CENTER_X - (7 * STRING_SPACING) - 2, y + 1);
        }
    };

    // Fonction helper pour tracer les lignes verticales (Cordes)
    const drawVerticalStrings = (y1: number, y2: number) => {
        doc.setLineWidth(0.4);
        STRING_CONFIGS.forEach(s => {
            const direction = s.hand === 'G' ? -1 : 1;
            const x = CENTER_X + (direction * s.index * STRING_SPACING);
            const color = hexToRgb(NOTE_COLORS[s.note.charAt(0)] || '#999');
            
            doc.setDrawColor(color.r, color.g, color.b); 
            doc.line(x, y1, x, y2);
        });
        
        // Ligne centrale
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(CENTER_X, y1, CENTER_X, y2);
    };

    // Pagination Loop
    const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN_BOTTOM;
    let availableHeight = PAGE_BOTTOM - cursorY;
    let ticksOnPage = Math.floor(availableHeight / TICK_SCALE);
    
    let processedTick = 0;

    while (processedTick < totalTicks) {
        const startTick = processedTick;
        const endTick = Math.min(totalTicks, startTick + ticksOnPage);
        const endY = cursorY + ((endTick - startTick) * TICK_SCALE);

        // 1. Dessiner les cordes verticales sur toute la hauteur de la section
        drawVerticalStrings(cursorY, endY);

        // 2. Itérer tick par tick pour dessiner la grille (comme le Visualizer)
        // On aligne sur les temps entiers
        const beatStart = Math.floor(startTick / 12) * 12;
        const beatEnd = Math.ceil(endTick / 12) * 12;

        for (let t = beatStart; t <= beatEnd; t += 12) {
            // Position Y relative à la page
            const y = cursorY + ((t - startTick) * TICK_SCALE);
            
            if (y >= cursorY && y <= endY) {
                // Ligne Temps Principal (Noire)
                doc.setDrawColor(0);
                doc.setLineWidth(0.3);
                doc.line(CENTER_X - (7 * STRING_SPACING), y, CENTER_X + (7 * STRING_SPACING), y);
                
                // Numéro du temps
                const beatNum = Math.floor(t / 12) + 1; // Simplifié, compteur absolu
                doc.setFontSize(7);
                doc.setTextColor(93, 64, 55);
                doc.text(beatNum.toString(), CENTER_X - (7 * STRING_SPACING) - 4, y + 1);

                // Sous-lignes
                // +6 ticks (1/2)
                drawSubLine(y + (6 * TICK_SCALE), 'grey', "1/2");
                // +3, +9 (1/4)
                drawSubLine(y + (3 * TICK_SCALE), 'tight', "1/4");
                drawSubLine(y + (9 * TICK_SCALE), 'tight', "1/4");
                // +1.5 ... (1/8)
                [1.5, 4.5, 7.5, 10.5].forEach(offset => {
                    drawSubLine(y + (offset * TICK_SCALE), 'spaced', "1/8");
                });
            }
        }

        // 3. Dessiner les Notes
        const pageNotes = notes.filter(n => n.tick >= startTick && n.tick < endTick);

        pageNotes.forEach(n => {
            const y = cursorY + ((n.tick - startTick) * TICK_SCALE);

            // Gestion TEXTE
            if (n.stringId === 'TEXTE' && n.message) {
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(141, 110, 99);
                const textW = doc.getTextWidth(n.message) + 4;
                doc.rect(CENTER_X - textW/2, y - 4, textW, 5, 'FD');
                doc.setFontSize(8);
                doc.setTextColor(93, 64, 55);
                doc.text(n.message, CENTER_X, y, { align: 'center' });
                return;
            }

            const conf = STRING_CONFIGS.find(s => s.stringId === n.stringId);
            if (conf) {
                const direction = conf.hand === 'G' ? -1 : 1;
                const x = CENTER_X + (direction * conf.index * STRING_SPACING);
                const color = hexToRgb(NOTE_COLORS[conf.note.charAt(0)] || '#000');
                
                // Cercle Note (Plein)
                doc.setFillColor(color.r, color.g, color.b);
                doc.setDrawColor(50); 
                doc.setLineWidth(0.1);
                doc.circle(x, y, NOTE_RADIUS, 'F');
                
                // Effet de brillance (Petit cercle blanc décalé) - Simule le gradient
                doc.setFillColor(255, 255, 255);
                doc.circle(x - 0.7, y - 0.7, NOTE_RADIUS * 0.3, 'F');

                // Contour Blanc (anneau)
                doc.setDrawColor(255, 255, 255);
                doc.setLineWidth(0.2);
                doc.circle(x, y, NOTE_RADIUS, 'S');
                
                // Doigté (P/I) à l'extérieur ou intérieur ? Visualizer le met à coté.
                // Sur PDF on va le mettre à côté pour lisibilité.
                if (n.doigt) {
                    const badgeX = x - NOTE_RADIUS - 2;
                    doc.setTextColor(93, 64, 55);
                    doc.setFontSize(7);
                    doc.setFont("helvetica", "bold");
                    const label = n.doigt === 'P' ? 'P' : 'I'; // Pas d'emoji dans PDF standard
                    doc.text(label, badgeX, y + 1, { align: "right" });
                }
            }
        });

        // Préparer page suivante
        processedTick = endTick;
        if (processedTick < totalTicks) {
            doc.addPage();
            pageNum++;
            drawPageHeader(pageNum);
            availableHeight = PAGE_BOTTOM - cursorY;
            ticksOnPage = Math.floor(availableHeight / TICK_SCALE);
        }
    }

    // Pied de page
    doc.setFontSize(8);
    doc.setTextColor(150);
    const today = new Date().toLocaleDateString();
    doc.text(`Exporté le ${today} - Ngonilélé Tab Generator`, PAGE_WIDTH - MARGIN_BOTTOM, PAGE_HEIGHT - 10, { align: "right" });

    doc.save(`${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_tablature.pdf`);
};