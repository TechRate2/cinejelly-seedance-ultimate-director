const BASE = "file://C:/Users/Admin/cinejelly-seedance-ultimate-director/dist";
const { looksLikeUserScript } = await import(BASE + "/agents/story-architect.js");

const prose = 'Our founder wakes before dawn. She walks to the roastery and lights the burner. "We never compromise on beans," she says to the camera. Then she pours a cup...';

const proseMultiline = `Our founder wakes before dawn.
She walks to the roastery and lights the burner.
"We never compromise on beans," she says to the camera.
Then she pours a cup and smiles.`;

const englishScreenplay = `INT. ROASTERY - DAWN
FOUNDER: We never compromise on beans.
She pours a cup.
EXT. STREET - DAY`;

const vietnameseScreenplay = `CẢNH 1: Rang cà phê
NGƯỜI SÁNG LẬP: Chúng tôi không bao giờ thỏa hiệp.
CẢNH 2: Pha cà phê
Cô ấy rót một tách.`;

console.log("prose (single-line):", looksLikeUserScript(prose));
console.log("prose (multi-line): ", looksLikeUserScript(proseMultiline));
console.log("english screenplay: ", looksLikeUserScript(englishScreenplay));
console.log("vietnamese screenplay:", looksLikeUserScript(vietnameseScreenplay));

// Check marker constant
const { USER_SCRIPT_OPEN_MARKER } = await import(BASE + "/core/simple-brief-resolver.js");
console.log("MARKER:", JSON.stringify(USER_SCRIPT_OPEN_MARKER));
console.log("prose with marker:", looksLikeUserScript(USER_SCRIPT_OPEN_MARKER + "\n" + prose));
