// The museum: fourteen wings of eight rooms, and the exhibit each room unlocks.
//
// Content-only. Nothing here knows how a grid is built or how a level is
// scored — `js/grid.js` turns a room into letters and `js/game.js` plays it.
//
// Three things are decided per WING rather than per room, because they are the
// difficulty curve and it should be impossible to author a room that steps out
// of it:
//
//   cols/rows   the grid. Columns are capped at 13 — a phone held upright gives
//               about 355 usable pixels, so 13 columns is a 27px cell and that
//               is the smallest letter worth reading. Rooms get taller instead.
//   dirs        which directions words may run in. This is the real difficulty
//               dial of a word search, far more than grid size: "along and
//               down" can be read line by line, and eight-way cannot.
//   word cap    no word may be longer than the grid is WIDE. Longer words would
//               still fit vertically, but they would then be findable only one
//               way, which quietly turns the hardest words into the easiest.
//
// Every room hides one extra word that is NOT on the list — the curiosity.
// Finding one pays coins and is the only thing in the campaign a careful player
// can miss entirely, so it is where the replay value lives.

const DIRSETS = {
  // → ↓ : readable line by line. Wing 1-2.
  plain: [[1, 0], [0, 1]],
  // + ↘
  down: [[1, 0], [0, 1], [1, 1]],
  // + ↗ : both diagonals, still nothing backwards.
  diag: [[1, 0], [0, 1], [1, 1], [1, -1]],
  // + ← ↑ : backwards, but only along the straight lines.
  back: [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1]],
  // all eight.
  all: [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]],
};

// One entry per wing, in order. `grid` is [cols, rows]; `dirs` names a DIRSET.
const WINGS = [
  {
    name: "Dinosaurs", icon: "🦕", edge: "#7bd88a", grid: [8, 9], dirs: "plain",
    blurb: "Start where every museum starts. Short words, straight lines, and something very large in the middle of the room.",
    rooms: [
      { name: "Meat Eaters", exhibit: "T. rex jaw", icon: "🦖",
        fact: "A single T. rex tooth is about as long as a banana.",
        words: ["RAPTOR", "CLAWS", "TEETH", "JAWS", "HUNTER"], secret: "ROAR" },
      { name: "Plant Eaters", exhibit: "Diplodocus neck bone", icon: "🌿",
        fact: "The longest dinosaurs were the gentle ones — some were as long as three buses.",
        words: ["SPIKES", "LEAVES", "TAIL", "HERD", "GIANT"], secret: "FERN" },
      { name: "Bones and Fossils", exhibit: "Fossil hunter's spade", icon: "🦴",
        fact: "A fossil is a bone that sat in the ground so long it slowly turned to rock.",
        words: ["BONES", "FOSSIL", "SKULL", "STONE", "SPADE"], secret: "AMBER" },
      { name: "In the Sky", exhibit: "Pterosaur wing", icon: "🪽",
        fact: "Pterosaurs were flying reptiles. They were not birds, and they were not dinosaurs either.",
        words: ["WINGS", "GLIDE", "BEAK", "CLIFF", "SOAR"], secret: "NEST" },
      { name: "In the Sea", exhibit: "Plesiosaur flipper", icon: "🌊",
        fact: "Some plesiosaurs had necks longer than the rest of their body put together.",
        words: ["FLIPPER", "OCEAN", "SHARK", "DEEP", "SWIM"], secret: "WAVES" },
      { name: "Eggs and Babies", exhibit: "Nest of fossil eggs", icon: "🥚",
        fact: "Even the biggest dinosaurs hatched from eggs no larger than a melon.",
        words: ["EGGS", "NEST", "HATCH", "SHELL", "BABY"], secret: "CHIRP" },
      { name: "Armour", exhibit: "Ankylosaurus tail club", icon: "🛡️",
        fact: "An ankylosaurus swung a bony club heavy enough to break a hunter's leg.",
        words: ["PLATES", "SPIKED", "SHIELD", "HORNS", "TOUGH"], secret: "CLUB" },
      { name: "The Big Rock", exhibit: "Shard from the crater", icon: "☄️",
        fact: "A rock the size of a city ended the age of dinosaurs in a single afternoon.",
        words: ["COMET", "CRATER", "IMPACT", "ASHES", "WINTER"], secret: "EXTINCT" },
    ],
  },

  {
    name: "Ancient Egypt", icon: "🏺", edge: "#ffc23d", grid: [9, 10], dirs: "plain",
    blurb: "Three thousand years of it, and they wrote almost all of it down. Still straight lines only.",
    rooms: [
      { name: "The Nile", exhibit: "Reed boat model", icon: "🛶",
        fact: "Egypt was called the gift of the Nile. When the river flooded, the fields grew.",
        words: ["RIVER", "REEDS", "BOATS", "FLOOD", "CROCODILE"], secret: "PAPYRUS" },
      { name: "Pyramids", exhibit: "Limestone casing block", icon: "🔺",
        fact: "The Great Pyramid was the tallest building in the world for 3,800 years.",
        words: ["PYRAMID", "SPHINX", "TOMB", "RAMPS", "GIZA", "BLOCKS"], secret: "LIMESTONE" },
      { name: "Pharaohs", exhibit: "Fragment of a gold crown", icon: "👑",
        fact: "A pharaoh was not merely a king. He was believed to be a god who happened to be alive.",
        words: ["PHARAOH", "CROWN", "THRONE", "RULER", "QUEEN", "GOLD"], secret: "CLEOPATRA" },
      { name: "Mummies", exhibit: "Linen wrappings", icon: "🧻",
        fact: "Mummy makers dried the body in salt for forty days before any wrapping began.",
        words: ["MUMMY", "LINEN", "BANDAGE", "SALT", "CANOPIC"], secret: "EMBALMER" },
      { name: "Gods", exhibit: "Statue of Bastet", icon: "🐈",
        fact: "Anubis had the head of a jackal, and weighed your heart against a single feather.",
        words: ["ANUBIS", "OSIRIS", "HORUS", "ISIS", "TEMPLE", "JACKAL"], secret: "SCARAB" },
      { name: "Writing", exhibit: "Scribe's palette", icon: "✍️",
        fact: "Nobody could read hieroglyphs for 1,400 years, until the Rosetta Stone gave the game away.",
        words: ["SCRIBE", "SYMBOLS", "PAPYRUS", "PALETTE", "CARVED"], secret: "ROSETTA" },
      { name: "Treasure", exhibit: "Gilded ostrich-feather fan", icon: "💰",
        fact: "Tutankhamun's tomb held over five thousand objects, and he was a minor king.",
        words: ["JEWELS", "AMULET", "MASK", "TREASURE", "CHEST", "SILVER"], secret: "SCEPTRE" },
      { name: "Everyday Life", exhibit: "Loaf of bread, 3,000 years old", icon: "🍞",
        fact: "The workers who built the pyramids were paid in bread and beer.",
        words: ["BREAD", "BEER", "FARMER", "LOOM", "SANDALS", "BARLEY"], secret: "DONKEY" },
    ],
  },

  {
    name: "Space", icon: "🚀", edge: "#6fb2ff", grid: [9, 10], dirs: "down",
    blurb: "Words start sloping downhill in this wing. Look diagonally as well as along.",
    rooms: [
      { name: "The Sun", exhibit: "Sunspot photograph, 1889", icon: "☀️",
        fact: "A million Earths would fit inside the Sun with room to spare.",
        words: ["SOLAR", "FLARE", "SUNSPOT", "CORONA", "LIGHT", "YELLOW"], secret: "ECLIPSE" },
      { name: "The Moon", exhibit: "Lunar dust sample", icon: "🌙",
        fact: "The Moon drifts about four centimetres further away every year.",
        words: ["LUNAR", "CRATER", "PHASES", "TIDES", "DUST", "ORBIT"], secret: "APOLLO" },
      { name: "Planets", exhibit: "Brass orrery", icon: "🪐",
        fact: "Saturn is so light that it would float, if you could find a bath big enough.",
        words: ["MARS", "VENUS", "SATURN", "JUPITER", "NEPTUNE", "RINGS"], secret: "MERCURY" },
      { name: "Rockets", exhibit: "Rocket engine nozzle", icon: "🚀",
        fact: "To stay in orbit rather than fall back down, you have to be going 28,000 km/h sideways.",
        words: ["ROCKET", "ENGINE", "FUEL", "LAUNCH", "THRUST", "STAGES"], secret: "COUNTDOWN" },
      { name: "Astronauts", exhibit: "Spacesuit glove", icon: "👩‍🚀",
        fact: "Astronauts grow up to five centimetres taller in space, then shrink again on the way home.",
        words: ["HELMET", "GLOVES", "VISOR", "FLOAT", "SPACE", "OXYGEN"], secret: "GRAVITY" },
      { name: "Stars", exhibit: "Hand-painted star chart", icon: "⭐",
        fact: "The light from some stars set out before there were dinosaurs to see it.",
        words: ["STARS", "GALAXY", "CLUSTER", "NEBULA", "BRIGHT", "DISTANT"], secret: "SUPERNOVA" },
      { name: "Comets", exhibit: "Iron meteorite", icon: "☄️",
        fact: "A comet's tail always points away from the Sun — never backwards behind it.",
        words: ["COMET", "METEOR", "ASTEROID", "FROZEN", "STREAK", "DUST"], secret: "HALLEY" },
      { name: "Telescopes", exhibit: "Brass refracting telescope", icon: "🔭",
        fact: "Galileo's first telescope was weaker than an ordinary pair of binoculars today.",
        words: ["LENS", "MIRROR", "GALILEO", "HUBBLE", "ZOOM", "NIGHT"], secret: "OBSERVER" },
    ],
  },

  {
    name: "Knights and Castles", icon: "🏰", edge: "#c98b3a", grid: [10, 11], dirs: "down",
    blurb: "Longer words, and the beginning of some very long walls.",
    rooms: [
      { name: "The Castle", exhibit: "Iron gate hinge", icon: "🏰",
        fact: "Castle stairs spiral clockwise, so a right-handed defender coming down had room to swing.",
        words: ["CASTLE", "TOWER", "MOAT", "KEEP", "GATEHOUSE", "DRAWBRIDGE", "WALLS"], secret: "PORTCULLIS" },
      { name: "Armour", exhibit: "Visored helm", icon: "🛡️",
        fact: "A full suit of plate armour weighed about as much as a large dog, spread all over you.",
        words: ["ARMOUR", "HELMET", "VISOR", "CHAINMAIL", "GAUNTLET", "SHIELD", "PLATE"], secret: "BLACKSMITH" },
      { name: "Weapons", exhibit: "Longsword, c. 1350", icon: "⚔️",
        fact: "Drawing an English longbow took the same pull as lifting a small child off the ground.",
        words: ["SWORD", "LANCE", "ARROW", "LONGBOW", "DAGGER", "MACE", "QUIVER"], secret: "CROSSBOW" },
      { name: "The Joust", exhibit: "Tournament lance tip", icon: "🐴",
        fact: "Jousting lances were built to shatter. Breaking one was how you scored the point.",
        words: ["JOUST", "TILTING", "TOURNEY", "CHAMPION", "BANNER", "HERALD", "CROWD"], secret: "UNHORSED" },
      { name: "Horses", exhibit: "War saddle", icon: "🐎",
        fact: "A knight's warhorse was trained to bite and kick on command, and cost more than his armour.",
        words: ["SADDLE", "STIRRUP", "BRIDLE", "GALLOP", "STABLE", "CHARGER", "REINS"], secret: "WARHORSE" },
      { name: "The Great Hall", exhibit: "Feast trencher", icon: "🍗",
        fact: "Guests ate off thick slices of stale bread called trenchers, then gave them to the poor.",
        words: ["FEAST", "MINSTREL", "TAPESTRY", "GOBLET", "TRENCHER", "JESTER", "FIRE"], secret: "BANQUET" },
      { name: "Under Siege", exhibit: "Trebuchet counterweight", icon: "🪨",
        fact: "The longest castle siege on record went on for more than three years.",
        words: ["SIEGE", "CATAPULT", "LADDERS", "TUNNEL", "ARROWS", "SURRENDER", "STARVE"], secret: "TREBUCHET" },
      { name: "Heraldry", exhibit: "Painted shield", icon: "🦁",
        fact: "In full armour nobody could tell who you were, so the shield had to say it for you.",
        words: ["CREST", "EMBLEM", "LION", "EAGLE", "MOTTO", "COLOURS", "QUARTERS"], secret: "BLAZON" },
    ],
  },

  {
    name: "Under the Sea", icon: "🐙", edge: "#56d6d0", grid: [10, 12], dirs: "diag",
    blurb: "Both diagonals now — words climb as well as fall.",
    rooms: [
      { name: "The Reef", exhibit: "Branch of staghorn coral", icon: "🪸",
        fact: "A coral reef is built by animals smaller than your fingernail, one on top of another.",
        words: ["CORAL", "POLYPS", "REEF", "CLOWNFISH", "ANEMONE", "COLOUR", "SHALLOW"], secret: "LAGOON" },
      { name: "Big Fish", exhibit: "Shark jaw", icon: "🦈",
        fact: "A great white can smell one drop of blood in a swimming pool's worth of water.",
        words: ["SHARK", "MARLIN", "TUNA", "SWORDFISH", "GROUPER", "STINGRAY", "TEETH"], secret: "BARRACUDA" },
      { name: "Tiny Things", exhibit: "Plankton slide", icon: "🦐",
        fact: "Most of the oxygen you breathe was made by plankton, not by trees.",
        words: ["PLANKTON", "SHRIMP", "KRILL", "LARVAE", "DRIFT", "MICROBE", "SWARM"], secret: "COPEPOD" },
      { name: "Shells", exhibit: "Nautilus shell, cut in half", icon: "🐚",
        fact: "The nautilus has been building the same spiral shell for 500 million years.",
        words: ["SHELL", "NAUTILUS", "SPIRAL", "OYSTER", "PEARL", "LIMPET", "COCKLE"], secret: "MOLLUSC" },
      { name: "The Deep", exhibit: "Anglerfish, preserved", icon: "🌑",
        fact: "At the bottom of the deepest trench the pressure is like fifty jumbo jets stacked on you.",
        words: ["ABYSS", "DARKNESS", "PRESSURE", "ANGLER", "GLOWING", "TRENCH", "FROZEN"], secret: "LANTERN" },
      { name: "Hunters", exhibit: "Octopus beak", icon: "🐙",
        fact: "An octopus can taste with its arms, which is how it hunts without looking.",
        words: ["OCTOPUS", "SQUID", "TENTACLE", "AMBUSH", "SUCKER", "HUNTER", "CAMOUFLAGE"], secret: "KRAKEN" },
      { name: "Whales", exhibit: "Whale earbone", icon: "🐋",
        fact: "A blue whale's heart is roughly the size of a small car.",
        words: ["WHALE", "BLUBBER", "SPOUT", "FLUKE", "MIGRATE", "BALEEN", "SINGING"], secret: "HUMPBACK" },
      { name: "Tides", exhibit: "Tide clock", icon: "🌊",
        fact: "The Moon's pull lifts the whole ocean, twice a day, everywhere at once.",
        words: ["TIDES", "MOON", "CURRENT", "ROCKPOOL", "SEAWEED", "WAVES", "SHORE"], secret: "ESTUARY" },
    ],
  },

  {
    name: "Inventions", icon: "💡", edge: "#ffb454", grid: [11, 12], dirs: "diag",
    blurb: "Everything in this wing was once the newest thing in the world.",
    rooms: [
      { name: "The Wheel", exhibit: "Bronze-age cart wheel", icon: "🛞",
        fact: "The wheel was invented for making pots. It took another 300 years to put one on a cart.",
        words: ["WHEEL", "AXLE", "CART", "POTTERY", "CHARIOT", "ROLLING", "SPOKES"], secret: "SUMERIAN" },
      { name: "Printing", exhibit: "Block of movable type", icon: "📚",
        fact: "Before printing, one book took a monk more than a year to copy out by hand.",
        words: ["PRINTING", "PRESS", "LETTERS", "GUTENBERG", "PAPER", "INKING", "BOOKS"], secret: "LIBRARY" },
      { name: "Steam", exhibit: "Boiler safety valve", icon: "🚂",
        fact: "The first steam engines were built for one dull job: pumping water out of mines.",
        words: ["STEAM", "BOILER", "PISTON", "ENGINE", "LOCOMOTIVE", "FACTORY", "PRESSURE"], secret: "RAILWAY" },
      { name: "Electricity", exhibit: "Carbon filament bulb", icon: "⚡",
        fact: "Edison tried six thousand materials before he found one that glowed without burning away.",
        words: ["CURRENT", "BATTERY", "FILAMENT", "CIRCUIT", "VOLTS", "WIRES", "EDISON"], secret: "LIGHTBULB" },
      { name: "Flight", exhibit: "Propeller blade", icon: "✈️",
        fact: "The Wright brothers' first flight was shorter than a jumbo jet is long.",
        words: ["FLIGHT", "WINGS", "PROPELLER", "GLIDER", "AIRCRAFT", "LIFTOFF", "WRIGHT"], secret: "AERODROME" },
      { name: "Telephones", exhibit: "Candlestick telephone", icon: "☎️",
        fact: "The first words ever spoken down a telephone were a call for help after spilling acid.",
        words: ["TELEPHONE", "DIAL", "RECEIVER", "CABLE", "SIGNAL", "RINGING", "OPERATOR"], secret: "EXCHANGE" },
      { name: "Computers", exhibit: "Punched card", icon: "💻",
        fact: "The first computer programmer was Ada Lovelace, a century before there were computers.",
        words: ["COMPUTER", "PROGRAM", "MEMORY", "SCREEN", "KEYBOARD", "PUNCHCARD", "BINARY"], secret: "ALGORITHM" },
      { name: "Medicine", exhibit: "Early brass microscope", icon: "💊",
        fact: "Penicillin was discovered because somebody left a dish out over the holidays.",
        words: ["MEDICINE", "VACCINE", "MICROSCOPE", "GERMS", "SURGERY", "HOSPITAL", "STETHOSCOPE"], secret: "PENICILLIN" },
    ],
  },

  {
    name: "Volcanoes and Rocks", icon: "🌋", edge: "#ff7043", grid: [11, 13], dirs: "back",
    blurb: "Words start running backwards here. Read every line both ways.",
    rooms: [
      { name: "Inside the Earth", exhibit: "Cutaway core model", icon: "🌍",
        fact: "The Earth's inner core is about as hot as the surface of the Sun.",
        words: ["CRUST", "MANTLE", "MAGMA", "PRESSURE", "MOLTEN", "LAYERS", "TECTONIC", "DEPTHS"], secret: "CONTINENT" },
      { name: "Eruption", exhibit: "Volcanic bomb", icon: "🌋",
        fact: "An ash cloud can climb higher than a passenger plane flies.",
        words: ["ERUPTION", "CRATER", "ASHES", "PLUME", "VENTING", "SMOKE", "RUMBLE", "CALDERA"], secret: "PYROCLASTIC" },
      { name: "Lava", exhibit: "Ropey pahoehoe lava", icon: "🔥",
        fact: "Lava can outrun a person, or move slower than a snail, depending on what is in it.",
        words: ["LAVA", "FLOWING", "MOLTEN", "BASALT", "GLOWING", "COOLING", "OBSIDIAN", "RIVERS"], secret: "PAHOEHOE" },
      { name: "Minerals", exhibit: "Cabinet of minerals", icon: "💎",
        fact: "You can identify a mineral by scratching it with a copper coin and seeing what happens.",
        words: ["MINERAL", "QUARTZ", "GYPSUM", "HARDNESS", "STREAK", "GRANITE", "FELDSPAR", "SULPHUR"], secret: "MALACHITE" },
      { name: "Crystals", exhibit: "Amethyst geode", icon: "❄️",
        fact: "A crystal grows by adding atoms in exactly the same pattern, over and over, for centuries.",
        words: ["CRYSTAL", "GEODE", "AMETHYST", "FACETS", "GROWING", "DIAMOND", "PRISM", "MINING"], secret: "LATTICE" },
      { name: "Earthquakes", exhibit: "Seismograph drum", icon: "📉",
        fact: "The ground moves in waves, which is why a big earthquake rolls instead of jolting.",
        words: ["TREMOR", "FAULT", "SHOCKWAVE", "RICHTER", "EPICENTRE", "SEISMIC", "RUPTURE", "AFTERSHOCK"], secret: "SEISMOGRAPH" },
      { name: "Caves", exhibit: "Tip of a stalactite", icon: "🕳️",
        fact: "A stalactite grows about as fast as a fingernail — if you gave the fingernail a century.",
        words: ["CAVERN", "STALACTITE", "LIMESTONE", "DRIPPING", "TUNNEL", "DARKNESS", "ECHOES", "UNDERGROUND"], secret: "STALAGMITE" },
      { name: "Fossils in Rock", exhibit: "Polished ammonite", icon: "🐚",
        fact: "Ammonites changed shape so reliably that geologists use them as clocks.",
        words: ["AMMONITE", "TRILOBITE", "SEDIMENT", "LAYERS", "IMPRINT", "ANCIENT", "PRESERVED", "QUARRY"], secret: "EXCAVATE" },
    ],
  },

  {
    name: "Weather", icon: "⛅", edge: "#8fd3ff", grid: [12, 13], dirs: "back",
    blurb: "Nine words a room, and a great deal of sky to look through.",
    rooms: [
      { name: "Clouds", exhibit: "Plate from a cloud atlas", icon: "☁️",
        fact: "An ordinary fair-weather cloud can weigh as much as a hundred elephants.",
        words: ["CUMULUS", "STRATUS", "CIRRUS", "WISPY", "TOWERING", "DROPLETS", "FLOATING", "ALTITUDE", "SHADOW"], secret: "CUMULONIMBUS" },
      { name: "Rain", exhibit: "Victorian rain gauge", icon: "🌧️",
        fact: "Raindrops are not tear-shaped. They start round and flatten out as they fall.",
        words: ["RAINFALL", "DROPLET", "PUDDLE", "DRIZZLE", "SHOWER", "DOWNPOUR", "GAUGE", "UMBRELLA", "SOAKED"], secret: "MONSOON" },
      { name: "Storms", exhibit: "Sand fused by lightning", icon: "⛈️",
        fact: "Lightning heats the air around it to five times the temperature of the Sun's surface.",
        words: ["THUNDER", "LIGHTNING", "TEMPEST", "GALES", "HURRICANE", "TORNADO", "SHELTER", "FLASH", "RUMBLE"], secret: "ELECTRICITY" },
      { name: "Snow", exhibit: "Bentley snowflake photograph", icon: "❄️",
        fact: "No two snowflakes are alike, but every single one has six sides.",
        words: ["SNOWFLAKE", "BLIZZARD", "FROST", "ICICLE", "DRIFTS", "POWDER", "FREEZING", "SLEDGE", "THAWING"], secret: "AVALANCHE" },
      { name: "Wind", exhibit: "Cup anemometer", icon: "💨",
        fact: "Admiral Beaufort's wind scale measures what the wind does, not how fast it goes.",
        words: ["BREEZE", "GUSTS", "WINDMILL", "WEATHERVANE", "HOWLING", "DIRECTION", "SAILING", "BEAUFORT", "DRAUGHT"], secret: "ANEMOMETER" },
      { name: "The Seasons", exhibit: "Orrery of the seasons", icon: "🍂",
        fact: "Seasons happen because the Earth leans over, not because it moves nearer the Sun.",
        words: ["SPRING", "SUMMER", "AUTUMN", "WINTER", "EQUINOX", "SOLSTICE", "HARVEST", "DAYLIGHT", "TILTED"], secret: "HEMISPHERE" },
      { name: "Rainbows", exhibit: "Glass prism", icon: "🌈",
        fact: "A rainbow is really a full circle. The ground just gets in the way of the bottom half.",
        words: ["RAINBOW", "SPECTRUM", "REFRACT", "PRISM", "VIOLET", "INDIGO", "SUNLIGHT", "ARCHES", "COLOURS"], secret: "WAVELENGTH" },
      { name: "Forecasting", exhibit: "Mercury barometer", icon: "📡",
        fact: "The first published weather forecast appeared in 1861 and was widely laughed at.",
        words: ["FORECAST", "BAROMETER", "PRESSURE", "SATELLITE", "ISOBARS", "MEASURE", "PATTERN", "CLIMATE", "PREDICT"], secret: "METEOROLOGY" },
    ],
  },

  {
    name: "The Human Body", icon: "🫀", edge: "#ff8a7a", grid: [12, 14], dirs: "all",
    blurb: "All eight directions from here on. Nothing is written the easy way any more.",
    rooms: [
      { name: "Bones", exhibit: "Articulated hand", icon: "🦴",
        fact: "More than half of all your bones are in your hands and your feet.",
        words: ["SKELETON", "SKULL", "RIBCAGE", "SPINE", "MARROW", "JOINTS", "KNUCKLE", "CALCIUM", "FEMUR"], secret: "COLLARBONE" },
      { name: "Muscles", exhibit: "Anatomical muscle chart", icon: "💪",
        fact: "The busiest muscle in your body is the one that moves your eye.",
        words: ["MUSCLES", "BICEPS", "TENDON", "STRETCH", "FLEXING", "FIBRES", "STRENGTH", "TWITCH", "CRAMP"], secret: "DIAPHRAGM" },
      { name: "The Heart", exhibit: "Sectioned model heart", icon: "🫀",
        fact: "Your heart beats about a hundred thousand times a day without ever being asked.",
        words: ["HEART", "PULSE", "ARTERY", "CHAMBER", "VALVES", "BLOOD", "CIRCULATE", "OXYGEN", "BEATING"], secret: "VENTRICLE" },
      { name: "Breathing", exhibit: "Bellows lung model", icon: "🫁",
        fact: "Spread out flat, the inside of your lungs would cover most of a tennis court.",
        words: ["LUNGS", "BREATHE", "WINDPIPE", "NOSTRIL", "INHALE", "EXHALE", "BUBBLES", "SIGHING", "AIRWAYS"], secret: "ALVEOLI" },
      { name: "The Brain", exhibit: "Phrenology head", icon: "🧠",
        fact: "Your brain uses about a fifth of all the energy you eat, and it never switches off.",
        words: ["BRAIN", "NERVES", "THINKING", "MEMORY", "SIGNALS", "NEURONS", "DREAMS", "WRINKLED", "IMPULSE"], secret: "CEREBELLUM" },
      { name: "Senses", exhibit: "Ear ossicle", icon: "👁️",
        fact: "The smallest bone in your body is in your ear and is the size of a grain of rice.",
        words: ["SIGHT", "HEARING", "TASTE", "SMELL", "TOUCH", "EARDRUM", "TONGUE", "PUPILS", "BALANCE"], secret: "STIRRUP" },
      { name: "Food", exhibit: "Model of the digestive tract", icon: "🍎",
        fact: "Your small intestine is about four times as long as you are tall.",
        words: ["STOMACH", "DIGEST", "SWALLOW", "NUTRIENT", "INTESTINE", "VITAMINS", "CHEWING", "ENERGY", "LIVER"], secret: "ENZYMES" },
      { name: "Skin and Hair", exhibit: "Magnified section of skin", icon: "🧴",
        fact: "You are wearing skin that is entirely new since about a month ago.",
        words: ["FRECKLES", "SWEATING", "FOLLICLE", "KERATIN", "SUNBURN", "GOOSEBUMPS", "FINGERTIP", "SHEDDING", "BRISTLE"], secret: "MELANIN" },
    ],
  },

  {
    name: "Music", icon: "🎺", edge: "#c6a2ff", grid: [12, 14], dirs: "all",
    blurb: "One room for every family of instrument, and one for everybody else's.",
    rooms: [
      { name: "Strings", exhibit: "Violin scroll", icon: "🎻",
        fact: "There are about seventy separate pieces of wood inside a violin.",
        words: ["VIOLIN", "CELLO", "GUITAR", "DOUBLEBASS", "PLUCKING", "BOWING", "FRETS", "RESONANCE", "STRINGS"], secret: "STRADIVARI" },
      { name: "Brass", exhibit: "Silver-plated cornet", icon: "🎺",
        fact: "Uncoil a French horn and you have about four metres of tubing.",
        words: ["TRUMPET", "TROMBONE", "TUBA", "CORNET", "FRENCHHORN", "VALVES", "MOUTHPIECE", "BUZZING", "FANFARE"], secret: "EUPHONIUM" },
      { name: "Woodwind", exhibit: "Boxwood flute", icon: "🪈",
        fact: "The saxophone is made of brass but counts as woodwind, because of its reed.",
        words: ["FLUTE", "CLARINET", "OBOE", "BASSOON", "RECORDER", "PICCOLO", "BREATH", "REEDS", "FINGERING"], secret: "SAXOPHONE" },
      { name: "Percussion", exhibit: "Calfskin timpani head", icon: "🥁",
        fact: "A timpani drum is tuned with a foot pedal, so it can play a proper tune.",
        words: ["DRUMS", "CYMBALS", "TIMPANI", "TRIANGLE", "XYLOPHONE", "TAMBOURINE", "RHYTHM", "STICKS", "MARIMBA"], secret: "GLOCKENSPIEL" },
      { name: "The Orchestra", exhibit: "Conductor's baton", icon: "🎼",
        fact: "The orchestra tunes to the oboe, because the oboe's note is the hardest of all to bend.",
        words: ["ORCHESTRA", "CONDUCTOR", "BATON", "SECTIONS", "TUNING", "CONCERT", "SYMPHONY", "PODIUM", "ENSEMBLE"], secret: "PHILHARMONIC" },
      { name: "Reading Music", exhibit: "Illuminated chant book", icon: "🎵",
        fact: "Monks wrote the first musical notes as tiny marks scribbled above the words.",
        words: ["STAVES", "CLEFS", "CROTCHET", "MINIM", "QUAVER", "SHARPS", "FLATS", "OCTAVE", "NOTATION"], secret: "SEMIBREVE" },
      { name: "Singing", exhibit: "Wax cylinder recording", icon: "🎤",
        fact: "Your voice sounds wrong on a recording because you normally hear it through your own skull.",
        words: ["SINGING", "CHOIR", "SOPRANO", "HARMONY", "LYRICS", "MELODY", "CHORUS", "VIBRATO", "BREATHING"], secret: "FALSETTO" },
      { name: "Around the World", exhibit: "Djembe drum", icon: "🌏",
        fact: "The didgeridoo may be the oldest wind instrument still being played today.",
        words: ["DJEMBE", "SITAR", "BAGPIPES", "DIDGERIDOO", "PANPIPES", "BALALAIKA", "KALIMBA", "GAMELAN", "STEELPAN"], secret: "UKULELE" },
    ],
  },

  {
    name: "Myths and Legends", icon: "🐉", edge: "#a78bfa", grid: [13, 14], dirs: "all",
    blurb: "Ten words a room, and not one of them is entirely true.",
    rooms: [
      { name: "Dragons", exhibit: "Carved dragon scale", icon: "🐉",
        fact: "Chinese dragons bring rain and good luck. European ones mostly bring trouble.",
        words: ["DRAGON", "SCALES", "HOARD", "TREASURE", "CAVERN", "WINGSPAN", "SERPENT", "LEGEND", "TALONS", "SMOKE"], secret: "WYVERN" },
      { name: "Greek Heroes", exhibit: "Red-figure vase", icon: "🏛️",
        fact: "Theseus found his way back out of the labyrinth with nothing but a ball of thread.",
        words: ["HERCULES", "ODYSSEUS", "PERSEUS", "THESEUS", "LABOURS", "QUESTS", "LABYRINTH", "ARMOUR", "ORACLE", "VOYAGE"], secret: "ARGONAUTS" },
      { name: "Norse Gods", exhibit: "Runestone rubbing", icon: "⚡",
        fact: "Thursday is named after Thor, and Wednesday after Odin. They are still on the calendar.",
        words: ["VALHALLA", "ASGARD", "HAMMER", "RAVENS", "RUNES", "THUNDER", "YGGDRASIL", "LONGSHIP", "FROST", "WOLVES"], secret: "RAGNAROK" },
      { name: "Monsters", exhibit: "Gorgon mask", icon: "👹",
        fact: "The Sphinx ate anybody who could not answer her riddle, which seems a little harsh.",
        words: ["MEDUSA", "MINOTAUR", "CYCLOPS", "HYDRA", "SPHINX", "CHIMERA", "GORGON", "KRAKEN", "SIRENS", "TERROR"], secret: "BASILISK" },
      { name: "Fairies", exhibit: "Fairy door", icon: "🧚",
        fact: "A ring of mushrooms in the grass was thought to mark where the fairies had danced.",
        words: ["FAIRIES", "PIXIES", "GLAMOUR", "TOADSTOOL", "CHANGELING", "MISCHIEF", "MOONLIGHT", "DANCING", "WISHES", "RINGS"], secret: "LEPRECHAUN" },
      { name: "Giants", exhibit: "Basalt column, Giant's Causeway", icon: "🪨",
        fact: "The Giant's Causeway is forty thousand columns of rock, and nearly every one is a hexagon.",
        words: ["GIANTS", "CAUSEWAY", "BEANSTALK", "BOULDER", "FOOTSTEP", "MOUNTAIN", "CLUMSY", "ROARING", "TROLLS", "STRIDE"], secret: "COLOSSUS" },
      { name: "Sea Legends", exhibit: "Ship's figurehead", icon: "🧜",
        fact: "Sailors believed a ship's figurehead could see the way through fog when the crew could not.",
        words: ["MERMAID", "LEVIATHAN", "MAELSTROM", "SHIPWRECK", "LIGHTHOUSE", "SEAFARER", "WHIRLPOOL", "COMPASS", "STORMS", "ANCHOR"], secret: "FIGUREHEAD" },
      { name: "Magic", exhibit: "Alchemist's flask", icon: "✨",
        fact: "Alchemists never did make gold, but they invented most of chemistry while trying.",
        words: ["WIZARD", "POTION", "SPELLS", "CAULDRON", "ENCHANT", "ALCHEMY", "AMULET", "INCANTATION", "SORCERY", "CHARMS"], secret: "PHILOSOPHER" },
    ],
  },

  {
    name: "Minibeasts", icon: "🐝", edge: "#7bd88a", grid: [13, 15], dirs: "all",
    blurb: "The biggest grids in the museum, for the smallest animals in it.",
    rooms: [
      { name: "Bees", exhibit: "Observation hive frame", icon: "🐝",
        fact: "A bee tells the others where the flowers are by dancing a figure of eight.",
        words: ["HONEYBEE", "NECTAR", "POLLEN", "WAGGLEDANCE", "HONEYCOMB", "QUEENBEE", "SWARMING", "BEESWAX", "HIVES", "FORAGER"], secret: "POLLINATION" },
      { name: "Ants", exhibit: "Plaster cast of an ant nest", icon: "🐜",
        fact: "An ant can carry fifty times its own weight, uphill, without complaining.",
        words: ["ANTHILL", "COLONY", "TUNNELS", "SOLDIER", "MANDIBLE", "PHEROMONE", "FORAGING", "LARVAE", "WORKERS", "NESTING"], secret: "LEAFCUTTER" },
      { name: "Butterflies", exhibit: "Cabinet of swallowtails", icon: "🦋",
        fact: "Inside the chrysalis the caterpillar dissolves almost completely before rebuilding itself.",
        words: ["BUTTERFLY", "CHRYSALIS", "CATERPILLAR", "ANTENNAE", "PROBOSCIS", "MIGRATION", "SPECKLED", "FLUTTER", "EMERGING", "MONARCH"], secret: "METAMORPHOSIS" },
      { name: "Beetles", exhibit: "Stag beetle", icon: "🪲",
        fact: "One animal in every four on Earth is a beetle. There are more of them than anything else.",
        words: ["ELYTRA", "STAGBEETLE", "LADYBIRD", "SCARAB", "WEEVIL", "ANTLERS", "ARMOURED", "BURROW", "DUNGBEETLE", "GLOSSY"], secret: "ENTOMOLOGY" },
      { name: "Spiders", exhibit: "Orb web mounted on glass", icon: "🕷️",
        fact: "Spider silk is stronger than steel of the same thickness, and a great deal lighter.",
        words: ["SPIDER", "SPINNERET", "COBWEB", "SILKEN", "TARANTULA", "ARACHNID", "FANGS", "ORBWEB", "PATIENCE", "VENOMOUS"], secret: "GOSSAMER" },
      { name: "In the Soil", exhibit: "Glass-sided wormery", icon: "🪱",
        fact: "Darwin spent forty years studying earthworms and called them the plough of the world.",
        words: ["EARTHWORM", "BURROWING", "COMPOST", "CENTIPEDE", "MILLIPEDE", "WOODLOUSE", "TUNNELLING", "DECAYING", "ROOTLETS", "RECYCLE"], secret: "NUTRIENTS" },
      { name: "In the Pond", exhibit: "Pond dipping net", icon: "🐸",
        fact: "A dragonfly nymph can spend five years underwater before its one summer in the air.",
        words: ["PONDSKATER", "DRAGONFLY", "TADPOLE", "NEWTS", "MAYFLY", "WATERBOATMAN", "NYMPHS", "DIPPING", "REEDBED", "RIPPLES"], secret: "DAMSELFLY" },
      { name: "Camouflage", exhibit: "Stick insect", icon: "🍃",
        fact: "Some stick insects sway gently on the spot, because a real twig would move in the breeze.",
        words: ["STICKINSECT", "CAMOUFLAGE", "MIMICRY", "DISGUISE", "BLENDING", "PRETENDING", "SPECKLES", "MOTIONLESS", "PREDATOR", "TWIGLIKE"], secret: "INVISIBLE" },
    ],
  },

  {
    name: "Ancient Rome", icon: "🏛️", edge: "#f2b134", grid: [13, 15], dirs: "all",
    blurb: "Eleven words a room. They built most of Europe; the least you can do is find them.",
    rooms: [
      { name: "The Forum", exhibit: "Marble inscription", icon: "🏛️",
        fact: "The Forum was a marketplace, a courthouse and a parliament, all in the same square.",
        words: ["FORUM", "SENATE", "TEMPLE", "MARBLE", "COLUMNS", "ORATORY", "CITIZENS", "BASILICA", "STATUES", "ROSTRUM", "MERCHANTS"], secret: "REPUBLIC" },
      { name: "The Legion", exhibit: "Legionary's hobnailed boot", icon: "🛡️",
        fact: "A legionary marched thirty kilometres a day carrying his own tent, tools and food.",
        words: ["LEGION", "CENTURION", "SOLDIERS", "STANDARD", "MARCHING", "JAVELIN", "TESTUDO", "SHIELDS", "FORTRESS", "DISCIPLINE", "EAGLES"], secret: "AUXILIARY" },
      { name: "Gladiators", exhibit: "Gladiator's helmet", icon: "⚔️",
        fact: "Most gladiator fights did not end in a death. A trained fighter was far too expensive to lose.",
        words: ["GLADIATOR", "COLOSSEUM", "ARENA", "TRIDENT", "RETIARIUS", "SPECTATORS", "COMBAT", "SANDALS", "CROWDS", "TRAINING", "VICTORY"], secret: "AMPHITHEATRE" },
      { name: "Roads and Bridges", exhibit: "Roman milestone", icon: "🌉",
        fact: "Roman concrete gets stronger in seawater, which is why the harbours are still standing.",
        words: ["AQUEDUCT", "MILESTONE", "COBBLES", "VIADUCT", "STRAIGHT", "SURVEYOR", "CONCRETE", "ARCHWAY", "PAVING", "JOURNEY", "ENGINEER"], secret: "CAUSEWAY" },
      { name: "Baths", exhibit: "Bronze strigil", icon: "🛁",
        fact: "Romans had no soap. They oiled themselves and scraped it off with a curved blade.",
        words: ["BATHHOUSE", "CALDARIUM", "FRIGIDARIUM", "STRIGIL", "STEAMROOM", "MOSAICS", "HYPOCAUST", "BATHING", "OLIVEOIL", "TOWELS", "CHATTER"], secret: "TEPIDARIUM" },
      { name: "The Villa", exhibit: "Floor mosaic panel", icon: "🏡",
        fact: "A Roman dining room had exactly three couches, because you ate lying down.",
        words: ["VILLA", "MOSAIC", "ATRIUM", "COURTYARD", "FRESCOES", "TRICLINIUM", "GARDENS", "SHUTTERS", "COUCHES", "AMPHORA", "SERVANTS"], secret: "PERISTYLE" },
      { name: "Gods of Rome", exhibit: "Bronze Jupiter", icon: "⚡",
        fact: "The Vestal Virgins kept a fire alight that was never, ever allowed to go out.",
        words: ["JUPITER", "MINERVA", "NEPTUNE", "MERCURY", "VESTA", "TEMPLES", "OFFERINGS", "AUGURY", "PRIESTESS", "SACRIFICE", "ALTARS"], secret: "PANTHEON" },
      { name: "The Empire", exhibit: "Map of the provinces", icon: "🗺️",
        fact: "At its largest the empire ran from Scotland to the Sahara without a break.",
        words: ["EMPEROR", "PROVINCE", "FRONTIER", "CONQUEST", "TRIBUTE", "CARTHAGE", "BRITANNIA", "HADRIAN", "TRIUMPH", "SENATORS", "COLONIES"], secret: "MEDITERRANEAN" },
    ],
  },

  {
    name: "Explorers", icon: "🧭", edge: "#22d3ee", grid: [13, 15], dirs: "all",
    blurb: "The last wing. Everybody in it went somewhere nobody had been, and most of them came back.",
    rooms: [
      { name: "Maps and Navigation", exhibit: "Brass sextant", icon: "🧭",
        fact: "Working out longitude at sea took a national prize, a clockmaker, and forty years.",
        words: ["COMPASS", "SEXTANT", "LATITUDE", "LONGITUDE", "CHARTING", "ASTROLABE", "BEARINGS", "CARTOGRAPHY", "MERIDIAN", "SOUNDINGS", "NORTHSTAR"], secret: "NAVIGATION" },
      { name: "By Sea", exhibit: "Ship's log book", icon: "⛵",
        fact: "Magellan's expedition set out with five ships and came home with one.",
        words: ["GALLEON", "MAGELLAN", "VOYAGES", "SCURVY", "HARBOUR", "RIGGING", "TRADEWINDS", "CROSSING", "MUTINY", "PROVISIONS", "LANDFALL"], secret: "CARAVEL" },
      { name: "The Poles", exhibit: "Sledge runner", icon: "🐧",
        fact: "Shackleton lost his ship, crossed 1,300km of freezing ocean in a lifeboat, and lost nobody.",
        words: ["ANTARCTIC", "SHACKLETON", "FROSTBITE", "HUSKIES", "SLEDGES", "ICEBERGS", "BLIZZARD", "AMUNDSEN", "CREVASSE", "PENGUINS", "ENDURANCE"], secret: "PEMMICAN" },
      { name: "Mountains", exhibit: "Oxygen cylinder", icon: "🏔️",
        fact: "There is about a third as much oxygen at the top of Everest as there is at the beach.",
        words: ["EVEREST", "SUMMIT", "CLIMBING", "ALTITUDE", "OXYGEN", "AVALANCHE", "SHERPAS", "BASECAMP", "GLACIER", "TENZING", "HILLARY"], secret: "MOUNTAINEER" },
      { name: "Jungles", exhibit: "Pressed rainforest leaf", icon: "🌴",
        fact: "More kinds of tree grow in one hectare of rainforest than in the whole of Britain.",
        words: ["RAINFOREST", "CANOPY", "MACHETE", "HUMIDITY", "EXPEDITION", "SPECIMENS", "UNDERGROWTH", "MOSQUITOES", "ORCHIDS", "RIVERBOAT", "BOTANIST"], secret: "AMAZONIA" },
      { name: "Deserts", exhibit: "Goatskin water bag", icon: "🐪",
        fact: "A camel does not store water in its hump. It stores fat, which is nearly as useful.",
        words: ["SAHARA", "CARAVAN", "CAMELS", "OASIS", "DUNES", "MIRAGE", "WATERSKIN", "SANDSTORM", "NOMADS", "TIMBUKTU", "SCORCHING"], secret: "DROMEDARY" },
      { name: "The Deep Ocean", exhibit: "Bathysphere porthole", icon: "🤿",
        fact: "More people have walked on the Moon than have reached the bottom of the Mariana Trench.",
        words: ["BATHYSPHERE", "SUBMERSIBLE", "TRENCHES", "PRESSURE", "SONAR", "PORTHOLE", "DESCENT", "MARIANA", "DARKNESS", "TETHERED", "PIONEERS"], secret: "CHALLENGER" },
      { name: "Into Space", exhibit: "Copy of the Voyager record", icon: "🌌",
        fact: "Voyager 1 is the furthest human object from Earth, and it is still sending signals home.",
        words: ["VOYAGER", "ORBITING", "SPACEWALK", "MOONLANDING", "ROVERS", "PROBES", "GAGARIN", "ARMSTRONG", "TELEMETRY", "FRONTIER", "INTERSTELLAR"], secret: "EXPLORATION" },
    ],
  },
];

// The campaign as one flat list, because almost everything (unlocking, the
// exhibit album, the level jump in the debug panel) wants a single index.
const LEVELS = [];
WINGS.forEach((wing, wi) => {
  wing.rooms.forEach((room, ri) => {
    const [cols, rows] = wing.grid;
    LEVELS.push({
      idx: LEVELS.length,
      wing: wi, room: ri,
      name: room.name,
      exhibit: room.exhibit, exhibitIcon: room.icon, fact: room.fact,
      cols, rows,
      dirs: wing.dirs,
      words: room.words,
      secret: room.secret,
    });
  });
});

// The Daily Puzzle. Deliberately mid-campaign in size and eight-way from the
// start: it is the one board the whole family plays, so it has to be the same
// job for a nine-year-old and an adult, not a wall for one of them.
const DAILY = { cols: 11, rows: 12, dirs: "all", words: 8 };

// Rush: three minutes, an endless stream of small grids, +1 for every word.
// Each grid cleared makes the next one a little wider, so a strong player is
// not simply doing the same puzzle faster — which is what stops the score
// converging on "how quickly can you drag".
const RUSH = {
  seconds: 180,
  cols: (cleared) => Math.min(12, 7 + Math.floor(cleared / 2)),
  rows: (cleared) => Math.min(13, 8 + Math.floor(cleared / 2)),
  words: (cleared) => Math.min(9, 4 + Math.floor(cleared / 2)),
  dirsFor: (cleared) => (cleared < 2 ? "down" : cleared < 4 ? "diag" : cleared < 6 ? "back" : "all"),
};

// Coins. There is no balance stored anywhere — `earned` and `spent` are kept as
// separate monotonic counters and the balance is derived, because a max()-merged
// balance would resurrect spent coins the first time two devices met.
const REWARD = {
  level: (stars) => 6 + 5 * stars,     // finishing a room
  curiosity: 25,                       // the hidden word, if you find it
  rushWord: 1,
  dailyClear: 30,
};

// Priced against the progression bot rather than by feel: an ordinary player
// working through all 112 rooms once banks enough for roughly one whole-word
// hint every other room. Cheaper than that and the museum can simply be bought.
const HINTS = {
  letter: { cost: 20, label: "🔤 First letter", blurb: "Lights up the first letter of a word you have not found." },
  word: { cost: 60, label: "🔦 Whole word", blurb: "Shows one whole word. Costs you the third star." },
};

if (typeof window === "undefined") {
  Object.assign(globalThis, { DIRSETS, WINGS, LEVELS, DAILY, RUSH, REWARD, HINTS });
}
