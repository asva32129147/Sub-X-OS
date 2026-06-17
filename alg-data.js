// alg-data.js — OLL, PLL, COLL data + recognition hints
// Images: cube.rider.biz VisualCube API (free, no key needed)
'use strict';

// OLL/COLL: top-down plan view via cubing.net VisualCube
const ollImg  = a => `https://visualcube.api.cubing.net/visualcube.php?fmt=png&size=150&view=plan&stage=oll&alg=${encodeURIComponent(a)}`;
const collImg = a => `https://visualcube.api.cubing.net/visualcube.php?fmt=png&size=150&view=plan&stage=coll&alg=${encodeURIComponent(a)}`;

// PLL: 3D isometric view showing 2 sides — same approach as bestsiteever.ru
// Uses bg=t (transparent bg), r=y34 (slight tilt to show 2 faces), plltype for top stickers only
const pllImg  = a => `https://visualcube.api.cubing.net/visualcube.php?fmt=png&size=200&view=trans&stage=pll&bg=t&r=y34x-34&alg=${encodeURIComponent(a)}`;
// Second angle: rotated 90° so you see the other 2 sides — for drill 2-side mode
const pllImg2 = a => `https://visualcube.api.cubing.net/visualcube.php?fmt=png&size=200&view=trans&stage=pll&bg=t&r=y124x-34&alg=${encodeURIComponent(a)}`;

const OLL_CASES = [
  {id:'OLL 1', group:'Dot',    alg:"R U2 R2 F R F' U2 R' F R F'",                hint:'No edges flipped. Full dot.'},
  {id:'OLL 2', group:'Dot',    alg:"F R U R' U' F' f R U R' U' f'",              hint:'No edges flipped.'},
  {id:'OLL 3', group:'Dot',    alg:"f R U R' U' f' U' F R U R' U' F'",           hint:'No edges flipped.'},
  {id:'OLL 4', group:'Dot',    alg:"f R U R' U' f' U F R U R' U' F'",            hint:'No edges flipped.'},
  {id:'OLL 5', group:'Line',   alg:"r' U2 R U R' U r",                           hint:'2 opposite edges. Bar on left+right.'},
  {id:'OLL 6', group:'Line',   alg:"r U2 R' U' R U' r'",                         hint:'2 opposite edges.'},
  {id:'OLL 7', group:'Line',   alg:"r U R' U R U2 r'",                           hint:'2 opposite edges.'},
  {id:'OLL 8', group:'Line',   alg:"r' U' R U' R' U2 r",                         hint:'2 opposite edges.'},
  {id:'OLL 9', group:'L',      alg:"R U R' U' R' F R2 U R' U' F'",              hint:'2 adjacent edges. L-shape.'},
  {id:'OLL 10',group:'L',      alg:"R U R' U R' F R F' R U2 R'",                hint:'2 adjacent edges.'},
  {id:'OLL 11',group:'L',      alg:"r' R2 U R' U R U2 R' U M'",                 hint:'2 adjacent edges.'},
  {id:'OLL 12',group:'L',      alg:"F R U R' U' F' U F R U R' U' F'",           hint:'2 adjacent edges.'},
  {id:'OLL 13',group:'L',      alg:"F U R U' R2 F' R U R U' R'",                hint:'2 adjacent edges.'},
  {id:'OLL 14',group:'L',      alg:"R' F R U R' F' R F U' F'",                  hint:'2 adjacent edges.'},
  {id:'OLL 15',group:'L',      alg:"r' U' r R' U' R U r' U r",                  hint:'2 adjacent edges.'},
  {id:'OLL 16',group:'L',      alg:"r U r' R U R' U' r U' r'",                  hint:'2 adjacent edges.'},
  {id:'OLL 17',group:'Cross',  alg:"R U R' U R' F R F' U2 R' F R F'",           hint:'Cross. Corners vary.'},
  {id:'OLL 18',group:'Cross',  alg:"r U R' U R U2 r2 U' R U' R' U2 r",          hint:'Cross.'},
  {id:'OLL 19',group:'Cross',  alg:"R U R' U' B' R' F R2 U' R' U' R U R' F'",  hint:'Cross.'},
  {id:'OLL 20',group:'Cross',  alg:"r U R' U' r' F R F'",                       hint:'Cross.'},
  {id:'OLL 21',group:'Cross',  alg:"R U2 R' U' R U R' U' R U' R'",              hint:'Cross. All 4 corners twisted.'},
  {id:'OLL 22',group:'Cross',  alg:"R U2 R2 U' R2 U' R2 U2 R",                 hint:'Cross. 2 diagonal corners.'},
  {id:'OLL 23',group:'Cross',  alg:"R2 D' R U2 R' D R U2 R",                   hint:'Cross. 2 adj corners same dir.'},
  {id:'OLL 24',group:'Cross',  alg:"r U R' U' r' F R F'",                       hint:'Cross. Fish (1 corner OK).'},
  {id:'OLL 25',group:'Cross',  alg:"R U R D R' U R D' R' U2 R'",               hint:'Cross. Anti-Sune corners.'},
  {id:'OLL 26',group:'Cross',  alg:"R U2 R' U' R U' R'",                        hint:'Cross. Sune — key alg!'},
  {id:'OLL 27',group:'Cross',  alg:"R U R' U R U2 R'",                          hint:'Cross. Anti-Sune — key alg!'},
  {id:'OLL 28',group:'Cross',  alg:"r U R' U' r' R U R U' R'",                 hint:'Cross. All twisted, cross fully done.'},
  {id:'OLL 29',group:'T',      alg:"R U R' U' R U' R' F' U' F R U R'",         hint:'T-shape. 2 adj edges + bar of corners.'},
  {id:'OLL 30',group:'T',      alg:"F R' F R2 U' R' U' R U R' F2",             hint:'T-shape.'},
  {id:'OLL 31',group:'T',      alg:"R' U' F U R U' R' F' R",                   hint:'T-shape.'},
  {id:'OLL 32',group:'T',      alg:"L U F' U' L' U L F L'",                    hint:'T-shape.'},
  {id:'OLL 33',group:'T',      alg:"R U R' U' R' F R F'",                      hint:'T-shape. Trigger-based. Very common.'},
  {id:'OLL 34',group:'T',      alg:"R U R2 U' R' F R U R U' F'",              hint:'T-shape.'},
  {id:'OLL 35',group:'T',      alg:"R U2 R2 F R F' R U2 R'",                   hint:'T-shape.'},
  {id:'OLL 36',group:'T',      alg:"L' U' L U' L' U L U L F' L' F",           hint:'T-shape.'},
  {id:'OLL 37',group:'T',      alg:"F R' F' R U R U' R'",                      hint:'T-shape.'},
  {id:'OLL 38',group:'Sq',     alg:"R U R' U R U' R' U' R' F R F'",           hint:'Square shape. Block on one side.'},
  {id:'OLL 39',group:'Sq',     alg:"L F' L' U' L U F U' L'",                  hint:'Square shape.'},
  {id:'OLL 40',group:'Sq',     alg:"R' F R U R' U' F' U R",                   hint:'Square shape.'},
  {id:'OLL 41',group:'C',      alg:"R U' R' U2 R U R' U2 B R' R B'",         hint:'C-shape edges.'},
  {id:'OLL 42',group:'C',      alg:"f' r U r' U' r' F r S",                   hint:'C-shape.'},
  {id:'OLL 43',group:'W',      alg:"f R' F' R U R U' R' S'",                  hint:'W-shape.'},
  {id:'OLL 44',group:'W',      alg:"F U R U' R' F'",                           hint:'W-shape (bar).'},
  {id:'OLL 45',group:'W',      alg:"F R U R' U' F'",                           hint:'W-shape.'},
  {id:'OLL 46',group:'W',      alg:"R' U' R' F R F' U R",                     hint:'W-shape.'},
  {id:'OLL 47',group:'W',      alg:"F U R U' R' F' R U R' U R U2 R'",        hint:'W-shape.'},
  {id:'OLL 48',group:'W',      alg:"F R U R' U' R U R' U' F'",               hint:'W-shape.'},
  {id:'OLL 49',group:'Awkward',alg:"r U' r2 U r2 U r2 U' r",                 hint:'Wide-R awkward shape.'},
  {id:'OLL 50',group:'Awkward',alg:"r' U r2 U' r2 U' r2 U r'",               hint:'Wide-R awkward.'},
  {id:'OLL 51',group:'I',      alg:"F U R U' R' U R U' R' F'",               hint:'I-shape. 4 edges + corner pairs.'},
  {id:'OLL 52',group:'I',      alg:"R' F' U' F U' R U R' U R",               hint:'I-shape.'},
  {id:'OLL 53',group:'I',      alg:"r' F' r U r' F r U' r' F' r U' r' F r", hint:'I-shape wide.'},
  {id:'OLL 54',group:'I',      alg:"r U R' U R U' R' U R U2 r'",             hint:'I-shape wide.'},
  {id:'OLL 55',group:'I',      alg:"R' F R U R U' R2 F' R2 U' R' U R U R'", hint:'I-shape.'},
  {id:'OLL 56',group:'I',      alg:"r U r' U R U' R' U R U' R' r U' r'",    hint:'I-shape wide.'},
  {id:'OLL 57',group:'I',      alg:"S R' F R S' R' F' R",                    hint:'I-shape S-moves.'},
];

const PLL_CASES = [
  {id:'Aa', group:'A perms', alg:"x R' U R' D2 R U' R' D2 R2 x'",
   hint:'Bookends ✓ | Checkerboard headlights | 2×2 block + bar | Headlights OPPOSITE blocks'},
  {id:'Ab', group:'A perms', alg:"x R2 D2 R U R' D2 R U' R x'",
   hint:'Bookends ✓ | Checkerboard headlights | Blocks SAME side as headlights'},
  {id:'E',  group:'E perm',  alg:"R' U' R' D' R U' R' D R U R' D' R U R' D R2",
   hint:'NO bookends | No adj solved edges | Fully scrambled look all 4 sides'},
  {id:'F',  group:'F perm',  alg:"R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
   hint:'NO bookends | One solved edge pair | Diagonal swap'},
  {id:'Ga', group:'G perms', alg:"R2 U R' U R' U' R U' R2 D U' R' U R D'",
   hint:'Bookends ✓ | Headlights ✓ | Block left of headlights'},
  {id:'Gb', group:'G perms', alg:"D R' U' R U D' R2 U R' U R U' R U' R2",
   hint:'Bookends ✓ | Headlights ✓ | Similar to Ga, block position differs'},
  {id:'Gc', group:'G perms', alg:"D R2 U' R U' R U R' U R2 D' U R U' R'",
   hint:'Bookends ✓ | No headlights on main face | Bar opposite side'},
  {id:'Gd', group:'G perms', alg:"R U R' U' D R2 U' R U' R' U R' U R2 D'",
   hint:'Bookends ✓ | Similar to Gc mirrored'},
  {id:'H',  group:'H perm',  alg:"M2 U M2 U2 M2 U M2",
   hint:'ALL 4 edges swapped in pairs | Symmetric | Two "columns" on all sides'},
  {id:'Ja', group:'J perms', alg:"x R2 F R F' R U2 r' U r U2 x'",
   hint:'Bookends ✓ | Headlights ✓ | Adj corner swap | One side near-solved'},
  {id:'Jb', group:'J perms', alg:"R U R' F' R U R' U' R' F R2 U' R'",
   hint:'Bookends ✓ | Headlights ✓ | Like Ja mirrored | T-perm family look'},
  {id:'Na', group:'N perms', alg:"R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
   hint:'NO bookends | Diagonal corner swap | Both headlights SAME side facing you'},
  {id:'Nb', group:'N perms', alg:"R' U R U' R' F' U' F R U R' U' R U' f R f'",
   hint:'NO bookends | Diagonal corner swap | Like Na opposite chirality'},
  {id:'Ra', group:'R perms', alg:"R U' R' U' R U R D R' U' R D' R' U2 R'",
   hint:'Bookends ✓ | Headlights ✓ | Adj 3-cycle | One correct side'},
  {id:'Rb', group:'R perms', alg:"R' U2 R' D' R U' R' D R U R U' R' U' R",
   hint:'Bookends ✓ | Headlights ✓ | Like Ra mirrored'},
  {id:'T',  group:'T perm',  alg:"R U R' U' R' F R2 U' R' U' R U R' F'",
   hint:'Bookends ✓ | Headlights ✓ | 2 corners + 2 edges swapped | Solved face + bar',
   auf:'None — no AUF needed',setup:"R U R' U' R' F R2 U' R' U' R U R' F'",
   altAlgs:["R2u R' U R' U' R u' R2 y' R' U R"]},
  {id:'Ua', group:'U perms', alg:"M2 U M U2 M' U M2",
   auf:'U or U2 before or after',altAlgs:["R U' R U R U R U' R' U' R2"],
   hint:'Bookends ✓ | ALL 4 corners correct | Edge 3-cycle | One solved side'},
  {id:'Ub', group:'U perms', alg:"M2 U' M U2 M' U' M2",
   auf:'U or U2 before or after',altAlgs:["R2 U R U R' U' R' U' R' U R'"],
   hint:'Bookends ✓ | ALL 4 corners correct | Like Ua other direction'},
  {id:'V',  group:'V perm',  alg:"R2 D' R2 U R2 D U' R D' R D R' U R U' R",
   hint:'NO bookends | Diagonal corners | One edge solved | V-shape visible'},
  {id:'Y',  group:'Y perm',  alg:"F R U' R' U' R U R' F' R U R' U' R' F R F'",
   hint:'NO bookends | Diagonal corners | One "bar" visible'},
  {id:'Z',  group:'Z perm',  alg:"M' U' M2 U' M2 U' M' U2 M2",
   hint:'NO bookends | All edges swapped | Alternating color pattern | Symmetric'},
];

const COLL_CASES = [
  // H COLL
  {id:'H1',group:'H COLL',alg:"R U2 R2 U' R2 U' R2 U2 R",         hint:'Corners: all pairs face same direction. Check headlight colors.'},
  {id:'H2',group:'H COLL',alg:"F R U R' U' R U R' U' F'",         hint:'Bar of same color on front side.'},
  {id:'H3',group:'H COLL',alg:"R2 D R' U2 R D' R' U2 R'",         hint:'All 4 U stickers same color.'},
  {id:'H4',group:'H COLL',alg:"r U' r' U' r U r' y' R' U R",      hint:'Checkerboard of U-layer corner stickers.'},
  {id:'H5',group:'H COLL',alg:"R' U' R U' R' U2 R",               hint:'⚠ Verify this algorithm — it currently duplicates Anti-Sune (S2) from a different COLL group, which cannot be correct since H and Sune COLL start from different corner permutations. Edit below with a checked source (J-Perm / SpeedCubeDB).'},
  {id:'H6',group:'H COLL',alg:"R U R' U R U2 R'",                 hint:'⚠ Verify this algorithm — it currently duplicates Sune (S1) from a different COLL group, which cannot be correct since H and Sune COLL start from different corner permutations. Edit below with a checked source (J-Perm / SpeedCubeDB).'},
  // Sune COLL
  {id:'S1',group:'Sune COLL',alg:"R U R' U R U2 R'",              hint:'Single twisted corner facing up-right. Classic Sune corner pattern.'},
  {id:'S2',group:'Sune COLL',alg:"R' U' R U' R' U2 R",            hint:'Anti-Sune corner pattern.'},
  {id:'S3',group:'Sune COLL',alg:"r U R' U' r' F R F'",           hint:'Same color UFL+URF, different back corners.'},
  {id:'S4',group:'Sune COLL',alg:"F' r U R' U' r' F R",           hint:'Mirrored S3.'},
  {id:'S5',group:'Sune COLL',alg:"L' U2 L U2 L F' L' F",          hint:'Bar on left side corners.'},
  {id:'S6',group:'Sune COLL',alg:"R U2 R' U2 R' F R F'",          hint:'Bar on right side corners.'},
  // T COLL
  {id:'T1',group:'T COLL',alg:"R U R' U' R' F R F'",             hint:'Bar across front corners. T-perm corner look.'},
  {id:'T2',group:'T COLL',alg:"L' U' L U L F' L' F",             hint:'Left mirror of T1.'},
  {id:'T3',group:'T COLL',alg:"r U' r2 F r2 U r' F'",            hint:'Diagonal corner arrangement.'},
  {id:'T4',group:'T COLL',alg:"l' U l2 F' l2 U' l F",            hint:'Mirror T3.'},
  {id:'T5',group:'T COLL',alg:"R' F' R U R' F R F U' F'",        hint:'No bars, headlights on back.'},
  {id:'T6',group:'T COLL',alg:"r' U r U2 r' U r",                hint:'Compact wide-R.'},
  // L COLL
  {id:'L1',group:'L COLL',alg:"F R U' R' U' R U R' F'",         hint:'Two adjacent headlights. Same color on 2 front corners.'},
  {id:'L2',group:'L COLL',alg:"R U2 R' U' R U' R'",             hint:'Anti version of L1.'},
  {id:'L3',group:'L COLL',alg:"R' U R U2 L' U R' U' L",         hint:'Diagonal headlights from two sides.'},
  {id:'L4',group:'L COLL',alg:"R' F R U' R' F' R F U F'",       hint:'No headlights, bars only.'},
  {id:'L5',group:'L COLL',alg:"r U' r' U r U r'",               hint:'Wide R. Corners form a line.'},
  {id:'L6',group:'L COLL',alg:"r' U r U' r' U' r",              hint:'Wide R mirror.'},
  // Pi COLL
  {id:'Pi1',group:'Pi COLL',alg:"R U' L' U R' U' L",           hint:'Double Sune look. Bar of color across top.'},
  {id:'Pi2',group:'Pi COLL',alg:"R U R' U' R' U2 R U R U' R'", hint:'Headlights on 2 sides.'},
  {id:'Pi3',group:'Pi COLL',alg:"R U2 R2 U' R U' R' U2 F R F'",hint:'One headlight, twisted corner pair.'},
  {id:'Pi4',group:'Pi COLL',alg:"r' U' R' F R F' R U' R' U2 r",hint:'Cross headlights (diagonal).'},
  {id:'Pi5',group:'Pi COLL',alg:"R' U2 R2 U R' U R U2 F' R' F",hint:'Mirrored Pi3.'},
  {id:'Pi6',group:'Pi COLL',alg:"r U R' U' r' F R2 U' R' U F'",hint:'No visible bars.'},
  // U COLL
  {id:'U1',group:'U COLL',alg:"R2 D R' U2 R D' R2 U' R' U' R",  hint:'One side fully colored. Uniform corner look.'},
  {id:'U2',group:'U COLL',alg:"R2 D' R U2 R' D R2 U R U R'",    hint:'Mirror of U1.'},
  {id:'U3',group:'U COLL',alg:"R' U2 R' F R F' R U' R' U' R U' R'",hint:'Bar of corner colors across back.'},
  {id:'U4',group:'U COLL',alg:"R U2 R F' R' F R' U R U R' U R", hint:'Mirror U3.'},
  {id:'U5',group:'U COLL',alg:"R' U R U2 R' U' R U' R' U2 R",   hint:'Two headlights facing away.'},
  {id:'U6',group:'U COLL',alg:"R U' R' U2 R U R' U R U2 R'",    hint:'Mirror U5.'},
  // Anti-Sune COLL
  {id:'AS1',group:'AS COLL',alg:"R U R' U R' F R F' R U2 R'",  hint:'Block on front, headlights on right.'},
  {id:'AS2',group:'AS COLL',alg:"R' F' r U r' F2 R",           hint:'Check headlights vs stickers carefully.'},
  {id:'AS3',group:'AS COLL',alg:"R U2 R' F' r U r' F2",        hint:'Compare to AS2.'},
  {id:'AS4',group:'AS COLL',alg:"R U2 R' U2 R' F R F'",        hint:'Bar + headlights.'},
  {id:'AS5',group:'AS COLL',alg:"R' U' R U' R' U R U' R' U2 R",hint:'All corners twisted same direction.'},
  {id:'AS6',group:'AS COLL',alg:"R U R' U R U' R' U R U2 R'",  hint:'Mirror AS5.'},
];


// ─── CLL (42 cases — Corners of Last Layer, 2x2 / ZBLL corner subset) ─────────
// Recognition: look at the 4 U-face stickers + front face stickers of U-layer corners
const CLL_CASES = [
  // H group
  {id:'H1',group:'H',alg:"R U2 R' U' R U' R' U' R U' R'",hint:'All 4 corners show same color on top. Sune+AntiSune feel.',setup:"y"},
  {id:'H2',group:'H',alg:"R U R' U R U2 R' U R U2 R'",   hint:'Two adjacent same, two diagonal same.',auf:'U or U2'},
  {id:'H3',group:'H',alg:"R2 U R' U R U' R U' R2 U' D R' U R D'",hint:'Checkerboard pattern on corners.'},
  {id:'H4',group:'H',alg:"R U2 R2 U' R U' R' U2 F R F'", hint:'H-CLL: bar visible on front corners.'},
  // Pi group
  {id:'Pi1',group:'Pi',alg:"F R U R' U' R U R' U' F'",   hint:'Pi: all 4 U stickers are the cross color.'},
  {id:'Pi2',group:'Pi',alg:"R U2 R2 U' R2 U' R2 U2 R",   hint:'Pi: symmetric case.'},
  {id:'Pi3',group:'Pi',alg:"R' U' R U' R' U2 R2 U R' U R U2 R'",hint:'Pi: twisted pair visible.'},
  {id:'Pi4',group:'Pi',alg:"r U R' U' r' F R F'",         hint:'Pi: wide move version.'},
  // Sune group
  {id:'S1',group:'Sune',alg:"R U R' U R U2 R'",           hint:'Sune: one corner pointing up-right. Most common CLL.',auf:'None needed'},
  {id:'S2',group:'Sune',alg:"R' U' R U' R' U2 R",         hint:'Anti-Sune. Mirror of S1.',auf:'None needed'},
  {id:'S3',group:'Sune',alg:"R2 D' R U2 R' D R U2 R",     hint:'Sune: fish shape — one corner correct.'},
  {id:'S4',group:'Sune',alg:"R U R' U' R U' R' U2 L' U R U' R' L",hint:'Sune: bar on left.'},
  // T group
  {id:'T1',group:'T',alg:"R U R' U' R' F R F'",           hint:'T: headlights on front, bar across corners.',auf:'None'},
  {id:'T2',group:'T',alg:"L' U' L U L F' L' F",           hint:'T: mirror of T1.',auf:'None'},
  {id:'T3',group:'T',alg:"F R' F' R U2 R U2 R'",          hint:'T: two opposite corners correct.'},
  {id:'T4',group:'T',alg:"R U2 R' U' R U R' U' R U' R'",  hint:'T: 3 twists, one correct.'},
  // L group
  {id:'L1',group:'L',alg:"r U R' U' r' F R F'",           hint:'L: wide-R trigger. All look same.',setup:"y2"},
  {id:'L2',group:'L',alg:"F R' F' R U R U' R'",           hint:'L: quick trigger.'},
  {id:'L3',group:'L',alg:"R U2 R D R' U2 R D' R2",        hint:'L: D-move required.'},
  {id:'L4',group:'L',alg:"R' U' R' F R F' R U R' U' R U' R'",hint:'L: headlights facing in.'},
  // U group
  {id:'U1',group:'U',alg:"R2 D' R U2 R' D R2 U R U R'",   hint:'U: uniform top, one side fully colored.'},
  {id:'U2',group:'U',alg:"R2 D R' U2 R D' R2 U' R' U' R", hint:'U: mirror of U1.'},
  {id:'U3',group:'U',alg:"R U' L' U R' U' L",             hint:'U: two non-adjacent corners correct.'},
  {id:'U4',group:'U',alg:"R' F R U' R' F' R F U F'",      hint:'U: F-move version.'},
  // AS group
  {id:'AS1',group:'Anti-Sune',alg:"R U2 R' U' R U' R'",   hint:'Anti-Sune CLL. Mirror feel.',auf:'None'},
  {id:'AS2',group:'Anti-Sune',alg:"R U R' U R U' R' U' R' F R F'",hint:'AS: trigger into F-move.'},
  {id:'AS3',group:'Anti-Sune',alg:"F' r U R' U' r' F R",  hint:'AS: F-move + wide trigger.'},
  {id:'AS4',group:'Anti-Sune',alg:"R' U2 R U R' U R",     hint:'AS: compact. Two opposite twisted.'},
];

// ─── 4x4 Edge Pairing (Felix Zemdegs / CubeSkills approach) ─────────────────
// Slice moves: Uw = top wide, Dw = bottom wide
// Key concept: pair the 4 sets of 2 matching edge pieces using r/r'/r2 + U moves
const EDGE_PAIRING_CASES = [
  {id:'Dedge 1',group:'Last 2 Edges',
   alg:"Uw R U R' Uw'",
   hint:'Two unpaired edges on U and F. Standard last-edge pair.',
   notes:'Most common case. Just Uw, set up, undo.'},
  {id:'Dedge 2',group:'Last 2 Edges',
   alg:"Uw' R U' R' Uw",
   hint:'Mirror of Dedge 1. Edges opposite orientation.',
   notes:'If Dedge 1 does not pair, try this mirror.'},
  {id:'Parity',group:'Parity',
   alg:"r2 B2 U2 l U2 r' U2 r U2 F2 r F2 l' B2 r2",
   hint:'OLL parity — single flipped edge on last layer.',
   notes:'Apply before or after solving last 2 edges. Recognize by single flipped UF edge.'},
  {id:'Flip L2E',group:'Last 2 Edges',
   alg:"Uw R U2 R' Uw'",
   hint:'Both last edges present but both flipped wrong way.',
   notes:'Dedge flip case. Both edges show on same side but swapped.'},
  {id:'3 Edges',group:'3-Edge Cases',
   alg:"r U2 r' U2 r U2 r' U2 r U2 r'",
   hint:'Three edge pairs, none paired. Cycle through with r moves.',
   notes:'If you have 3 unpaired, do this then pair normally.'},
  {id:'Free Slice',group:'Free Slice',
   alg:"Uw2 r' U r Uw2",
   hint:'Free slice method: Uw2 puts two edges in, pair, Uw2 back.',
   notes:'Felix preferred method for most edge pairs. Keeps F2L intact.'},
  {id:'Inner Layer',group:'Inner Layer',
   alg:"r U r'",
   hint:'Pair with inner-layer trick. Quick when edges are set up.',
   notes:'Most efficient when one edge is already in position.'},
];

const ALG_SETS = {
  'OLL':  { name:'OLL',  description:'57 cases — Orient Last Layer',                     event:'333', recognition:'standard', imgFn:ollImg,  cases:OLL_CASES  },
  'PLL':  { name:'PLL',  description:'21 cases — Permute Last Layer',                    event:'333', recognition:'2-side',   imgFn:pllImg,  imgFn2:pllImg2, cases:PLL_CASES  },
  'COLL': { name:'COLL', description:'42 cases — Corners of Last Layer (edges oriented)', event:'333', recognition:'corner',   imgFn:collImg, cases:COLL_CASES },
  'CLL':  { name:'CLL',  description:'42 cases — Corners of Last Layer (2x2 / top corners)', event:'222', recognition:'corner', imgFn:collImg, cases:CLL_CASES },
  '4x4-L2E': { name:'4x4 Last 2 Edges', description:'Edge pairing cases — Felix Zemdegs / CubeSkills', event:'444', recognition:'standard', imgFn:null, cases:EDGE_PAIRING_CASES },
};

function getCustomSets() { try { return JSON.parse(localStorage.getItem('subx_custom_algs')||'{}'); } catch { return {}; } }
function saveCustomSets(s){ localStorage.setItem('subx_custom_algs', JSON.stringify(s)); }

// ── Per-case algorithm overrides ──────────────────────────────────────────
// Lets the user correct any built-in algorithm (e.g. a wrong COLL alg)
// directly in Learn mode. Keyed by "setKey::caseId" -> corrected alg string.
// Applied on every getAllSets() call so corrections persist and survive
// re-imports of the underlying data.
function getAlgOverrides() { try { return JSON.parse(localStorage.getItem('subx_alg_overrides')||'{}'); } catch { return {}; } }
function setAlgOverride(setKey, caseId, alg) {
  const o = getAlgOverrides();
  o[setKey + '::' + caseId] = alg;
  localStorage.setItem('subx_alg_overrides', JSON.stringify(o));
}
function clearAlgOverride(setKey, caseId) {
  const o = getAlgOverrides();
  delete o[setKey + '::' + caseId];
  localStorage.setItem('subx_alg_overrides', JSON.stringify(o));
}

function getAllSets() {
  const merged   = { ...ALG_SETS, ...getCustomSets() };
  const overrides = getAlgOverrides();
  if (!Object.keys(overrides).length) return merged;
  // Apply overrides without mutating the original case objects/arrays
  const result = {};
  for (const setKey in merged) {
    const set = merged[setKey];
    result[setKey] = {
      ...set,
      cases: (set.cases || []).map(c => {
        const key = setKey + '::' + c.id;
        return overrides[key] !== undefined ? { ...c, alg: overrides[key] } : c;
      }),
    };
  }
  return result;
}
