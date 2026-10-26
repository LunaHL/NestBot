// 🍹 The Nest Café & Bar: everything you might want to change lives here.
// Drinks, prices, serving lines, latte art and limits. The code that uses
// this is in src/services/drinks.js and src/commands/drinks.js.
//
// Adding a drink: copy an entry in MENU, give it a new key (lowercase, no
// spaces; it's also used in picture file names) and restart the bot.
//   category        -> one of CATEGORIES below
//   caffeine: true  -> counts toward the caffeine limit (coffee, black/green tea…)
//   alcohol: true   -> counts toward the alcohol limit
//   blackTea: true  -> counts for the black tea achievement
//   art: true       -> can get latte art (milky drinks)
//   halloween: true -> only orderable on October 31
//   imagePrompt     -> description used by `npm run drink-art`

// Limits per person per day
const CAFFEINE_LIMIT = 6; // caffeinated drinks before NestBot cuts you off
const JITTERY_AT = 4; // from this many caffeinated drinks on, NestBot comments
const ALCOHOL_LIMIT = 3; // alcoholic drinks before the bar closes for you
const TIPSY_AT = 2; // from this many alcoholic drinks on, NestBot comments
const TOTAL_LIMIT = 12; // any drinks at all (so nobody spams the bar)

const LUCKY_CHANCE = 0.05; // drink is free ("on the house")
const LATTE_ART_CHANCE = 0.35; // only for drinks with art: true

// Sections of the menu, in this order. `place` decides the picture scene
// (cozy café table or bar counter) in `npm run drink-art`.
const CATEGORIES = {
  coffee: { name: 'Coffee', emoji: '☕', place: 'cafe' },
  tea: { name: 'Tea', emoji: '🫖', place: 'cafe' },
  chocolate: { name: 'Hot Chocolate', emoji: '🍫', place: 'cafe' },
  cocktail: { name: 'Cocktails', emoji: '🍹', place: 'bar' },
  beer: { name: 'Beer', emoji: '🍺', place: 'bar' },
  wine: { name: 'Wine', emoji: '🍷', place: 'bar' },
  halloween: { name: 'Halloween Specials', emoji: '🎃', place: 'cafe' },
};

// 🍹 The menu. Add, remove or reprice drinks here.
const MENU = {
  // ☕ Coffee
  espresso: {
    name: 'Espresso',
    emoji: '☕',
    price: 3,
    category: 'coffee',
    caffeine: true,
    art: false,
    imagePrompt:
      'a small white espresso cup with dark crema-topped espresso on a saucer',
    lines: [
      'Short, strong, no nonsense. Like me.',
      'One espresso. Drink it before it judges you.',
      'Tiny cup, big decisions ahead.',
    ],
  },
  americano: {
    name: 'Americano',
    emoji: '☕',
    price: 3,
    category: 'coffee',
    caffeine: true,
    art: false,
    imagePrompt: 'a ceramic mug of black americano coffee',
    lines: [
      'Espresso, but make it last longer.',
      'Hot water and ambition. Enjoy.',
    ],
  },
  cappuccino: {
    name: 'Cappuccino',
    emoji: '☕',
    price: 5,
    category: 'coffee',
    caffeine: true,
    art: true,
    imagePrompt:
      'a wide ceramic cappuccino cup with thick milk foam on a saucer',
    lines: [
      'Extra foam, because you deserve fluff today.',
      'Careful, foam mustache incoming.',
    ],
  },
  latte: {
    name: 'Latte',
    emoji: '🥛',
    price: 5,
    category: 'coffee',
    caffeine: true,
    art: true,
    imagePrompt: 'a tall latte glass with creamy milk foam',
    lines: [
      'Milky, warm, and mildly comforting. Like a blanket in a cup.',
      'One latte, steamed to perfection. Mostly.',
    ],
  },
  flatwhite: {
    name: 'Flat White',
    emoji: '☕',
    price: 5,
    category: 'coffee',
    caffeine: true,
    art: true,
    imagePrompt:
      'a small ceramic cup of flat white coffee with silky microfoam',
    lines: [
      'For when a latte is too much commitment.',
      'Velvety. Smooth. Pretentious. Perfect.',
    ],
  },
  mocha: {
    name: 'Mocha',
    emoji: '🍫',
    price: 6,
    category: 'coffee',
    caffeine: true,
    art: true,
    imagePrompt:
      'a mug of chocolate mocha coffee with a little chocolate drizzle on the rim',
    lines: [
      "Coffee and chocolate. Let's not pretend this is about the coffee.",
      'Dessert disguised as a drink. I won’t tell.',
    ],
  },
  caramel: {
    name: 'Caramel Macchiato',
    emoji: '🍯',
    price: 6,
    category: 'coffee',
    caffeine: true,
    art: true,
    imagePrompt:
      'a glass cup of caramel macchiato with caramel drizzle on the rim',
    lines: [
      'Drizzled with caramel. Sticky fingers are your problem.',
      'Sweet enough to fix at least one bad mood.',
    ],
  },
  iced: {
    name: 'Iced Coffee',
    emoji: '🧊',
    price: 5,
    category: 'coffee',
    caffeine: true,
    art: false,
    imagePrompt: 'a tall glass of iced coffee with ice cubes and a straw',
    lines: ['Cold brew for hot heads.', 'Ice ice coffee.'],
  },
  pumpkin: {
    name: 'Pumpkin Spice Latte',
    emoji: '🎃',
    price: 7,
    category: 'coffee',
    caffeine: true,
    art: true,
    imagePrompt:
      'a mug of pumpkin spice latte with a cinnamon stick, small autumn leaves around it',
    lines: [
      'It is always pumpkin season in the Nest.',
      'Cinnamon, nutmeg and a little bit of autumn magic.',
    ],
  },
  special: {
    name: 'Nest Special',
    emoji: '🪺',
    price: 10,
    category: 'coffee',
    caffeine: true,
    art: true,
    imagePrompt:
      'a fancy, slightly magical-looking cup of coffee with a tiny bird nest decoration on the saucer',
    lines: [
      'Secret ingredient today: {secret}. Don’t ask.',
      'House recipe with a dash of {secret}. Trust me.',
    ],
  },
  decaf: {
    name: 'Decaf',
    emoji: '😐',
    price: 1,
    category: 'coffee',
    art: false,
    imagePrompt: 'a plain, slightly sad-looking mug of decaf coffee',
    lines: [
      '…Decaf? In this economy? Fine.',
      'Here. It’s basically warm bean water. Enjoy, I guess.',
    ],
  },

  // 🫖 Tea
  blacktea: {
    name: 'Black Tea',
    emoji: '🫖',
    price: 3,
    category: 'tea',
    caffeine: true,
    blackTea: true,
    art: false,
    imagePrompt:
      'a classic porcelain teacup of strong dark black tea with a small teapot beside it',
    lines: [
      'Strong, dark and dependable. The backbone of the Nest.',
      'Black tea, steeped exactly four minutes. Because I respect you.',
      'Milk? Sugar? Lemon? I’m not judging. Much.',
    ],
  },
  earlgrey: {
    name: 'Earl Grey',
    emoji: '🫖',
    price: 4,
    category: 'tea',
    caffeine: true,
    blackTea: true,
    art: false,
    imagePrompt:
      'a delicate teacup of Earl Grey black tea with a slice of lemon on the saucer',
    lines: [
      'Tea. Earl Grey. Hot.',
      'A hint of bergamot and a lot of sophistication.',
    ],
  },
  breakfast: {
    name: 'English Breakfast',
    emoji: '🫖',
    price: 3,
    category: 'tea',
    caffeine: true,
    blackTea: true,
    art: false,
    imagePrompt:
      'a sturdy mug of English Breakfast black tea with a splash of milk',
    lines: [
      'Strong enough to wake up the whole Nest.',
      'Builder’s brew. The spoon stands up on its own.',
    ],
  },
  darjeeling: {
    name: 'Darjeeling',
    emoji: '🫖',
    price: 5,
    category: 'tea',
    caffeine: true,
    blackTea: true,
    art: false,
    imagePrompt: 'a fine glass teacup of golden Darjeeling black tea',
    lines: [
      'The champagne of teas. Pinky up.',
      'Light, floral and fancy. You have taste.',
    ],
  },
  chai: {
    name: 'Chai Latte',
    emoji: '🫖',
    price: 5,
    category: 'tea',
    caffeine: true,
    blackTea: true,
    art: true,
    imagePrompt:
      'a mug of spiced chai latte with milk foam, cinnamon sticks and star anise beside it',
    lines: [
      'Black tea, spices and steamed milk. A hug in a mug.',
      'Cinnamon, cardamom, ginger… and a little bit of magic.',
    ],
  },
  greentea: {
    name: 'Green Tea',
    emoji: '🍵',
    price: 3,
    category: 'tea',
    caffeine: true,
    art: false,
    imagePrompt: 'a small handleless ceramic cup of clear green tea',
    lines: [
      'Calm, clean, zen. Breathe.',
      'Antioxidants. You’re basically a wellness guru now.',
    ],
  },
  matcha: {
    name: 'Matcha Latte',
    emoji: '🍵',
    price: 6,
    category: 'tea',
    caffeine: true,
    art: true,
    imagePrompt: 'a glass of bright green matcha latte with frothy milk',
    lines: [
      'Whisked with love. And a bamboo whisk.',
      'Green, frothy and very aesthetic.',
    ],
  },
  peppermint: {
    name: 'Peppermint Tea',
    emoji: '🌿',
    price: 3,
    category: 'tea',
    art: false,
    imagePrompt: 'a glass cup of peppermint tea with fresh mint leaves',
    lines: [
      'Fresh as a minty breeze.',
      'Good for the tummy, good for the soul.',
    ],
  },
  chamomile: {
    name: 'Chamomile Tea',
    emoji: '🌼',
    price: 3,
    category: 'tea',
    art: false,
    imagePrompt:
      'a cup of chamomile tea with small chamomile flowers around it',
    lines: [
      'Sleepy-time tea. Don’t fall asleep in chat.',
      'Gentle and calming. Unlike this server.',
    ],
  },
  fruittea: {
    name: 'Fruit Tea',
    emoji: '🍓',
    price: 3,
    category: 'tea',
    art: false,
    imagePrompt:
      'a glass teapot of red berry fruit tea with pieces of fruit floating inside',
    lines: [
      'Berries and hibiscus. Basically a hot smoothie.',
      'Fruity, red and suspiciously sweet.',
    ],
  },

  // 🍫 Hot chocolate
  hotchocolate: {
    name: 'Hot Chocolate',
    emoji: '🍫',
    price: 5,
    category: 'chocolate',
    art: true,
    imagePrompt: 'a big mug of rich, creamy hot chocolate with foam on top',
    lines: [
      'Rich, warm and chocolatey. Problems solved.',
      'Extra chocolate, because you deserve it.',
    ],
  },
  marshmallow: {
    name: 'Hot Chocolate with Marshmallows',
    emoji: '☁️',
    price: 6,
    category: 'chocolate',
    art: false,
    imagePrompt:
      'a mug of hot chocolate piled high with fluffy pink and white marshmallows',
    lines: [
      'Marshmallows: one per bad day. I gave you extra.',
      'More marshmallow than chocolate. As it should be.',
    ],
  },
  whitechocolate: {
    name: 'White Hot Chocolate',
    emoji: '🤍',
    price: 6,
    category: 'chocolate',
    art: true,
    imagePrompt:
      'a mug of creamy white hot chocolate with white chocolate shavings on the saucer',
    lines: [
      'Sweet, creamy and a little bit fancy.',
      'White chocolate. Controversial, but delicious.',
    ],
  },

  // 🍹 Cocktails
  mojito: {
    name: 'Mojito',
    emoji: '🍹',
    price: 8,
    category: 'cocktail',
    alcohol: true,
    art: false,
    imagePrompt:
      'a tall glass of mojito with fresh mint, lime wedges and crushed ice',
    lines: [
      'Mint, lime, rum. Summer in a glass.',
      'Muddled with care. Mostly with frustration.',
    ],
  },
  margarita: {
    name: 'Margarita',
    emoji: '🍸',
    price: 8,
    category: 'cocktail',
    alcohol: true,
    art: false,
    imagePrompt: 'a margarita glass with a salted rim and a slice of lime',
    lines: [
      'Salt rim, lime, tequila. Olé.',
      'Shaken, not stirred. Wrong cocktail, same energy.',
    ],
  },
  pinacolada: {
    name: 'Piña Colada',
    emoji: '🍍',
    price: 9,
    category: 'cocktail',
    alcohol: true,
    art: false,
    imagePrompt:
      'a creamy piña colada in a curvy glass with a pineapple slice and a tiny paper umbrella',
    lines: [
      'If you like piña coladas… you know the rest.',
      'Coconut, pineapple and a tiny umbrella. Vacation mode on.',
    ],
  },
  aperol: {
    name: 'Aperol Spritz',
    emoji: '🍊',
    price: 8,
    category: 'cocktail',
    alcohol: true,
    art: false,
    imagePrompt:
      'a large wine glass of bright orange Aperol Spritz with an orange slice and ice cubes',
    lines: [
      'Orange, bubbly and very photogenic.',
      'Aperitivo time. Pretend we’re in Italy.',
    ],
  },
  espressomartini: {
    name: 'Espresso Martini',
    emoji: '🍸',
    price: 9,
    category: 'cocktail',
    alcohol: true,
    caffeine: true,
    art: false,
    imagePrompt:
      'an espresso martini in a coupe glass with creamy foam and three coffee beans on top',
    lines: [
      'Wakes you up and calms you down. Confusing, but effective.',
      'For when you can’t decide between coffee and a cocktail.',
    ],
  },
  cosmopolitan: {
    name: 'Cosmopolitan',
    emoji: '🍸',
    price: 9,
    category: 'cocktail',
    alcohol: true,
    art: false,
    imagePrompt:
      'a pink cosmopolitan in a martini glass with an orange peel twist',
    lines: [
      'Pink, classy and a little dramatic. Like you.',
      'Cranberry, lime and main character energy.',
    ],
  },
  sunrise: {
    name: 'Nest Sunrise (alcohol-free)',
    emoji: '🌅',
    price: 6,
    category: 'cocktail',
    art: false,
    imagePrompt:
      'a tall glass of orange-to-red layered alcohol-free sunrise mocktail with an orange slice and a cherry',
    lines: [
      'All the color, none of the hangover.',
      'Orange juice, grenadine and good decisions.',
    ],
  },

  // 🍺 Beer
  pilsner: {
    name: 'Pilsner',
    emoji: '🍺',
    price: 5,
    category: 'beer',
    alcohol: true,
    art: false,
    imagePrompt:
      'a tall glass of golden pilsner beer with a thick white foam head',
    lines: ['Cold, crisp and golden. Prost!', 'Freshly tapped. Mind the foam.'],
  },
  wheatbeer: {
    name: 'Wheat Beer',
    emoji: '🍺',
    price: 5,
    category: 'beer',
    alcohol: true,
    art: false,
    imagePrompt:
      'a tall curved glass of cloudy golden wheat beer with a big foam head',
    lines: [
      'Cloudy, fruity and very Bavarian.',
      'Poured slowly at an angle. I’m a professional.',
    ],
  },
  ipa: {
    name: 'Craft IPA',
    emoji: '🍺',
    price: 6,
    category: 'beer',
    alcohol: true,
    art: false,
    imagePrompt:
      'a glass of hazy amber IPA craft beer with a few green hop cones beside it',
    lines: [
      'Hoppy, bitter and a bit pretentious. Cheers.',
      'Brewed by someone with a beard and opinions.',
    ],
  },

  // 🍷 Wine
  redwine: {
    name: 'Red Wine',
    emoji: '🍷',
    price: 7,
    category: 'wine',
    alcohol: true,
    art: false,
    imagePrompt: 'a glass of deep red wine next to a dark wine bottle',
    lines: [
      'Swirl, sniff, sip. Act like you know what you’re doing.',
      'Full-bodied, with notes of… grapes. Definitely grapes.',
    ],
  },
  whitewine: {
    name: 'White Wine',
    emoji: '🥂',
    price: 7,
    category: 'wine',
    alcohol: true,
    art: false,
    imagePrompt: 'a glass of chilled pale white wine with condensation on it',
    lines: ['Crisp, chilled and refreshing.', 'Pairs well with gossip.'],
  },
  rose: {
    name: 'Rosé',
    emoji: '🌸',
    price: 7,
    category: 'wine',
    alcohol: true,
    art: false,
    imagePrompt: 'a glass of pink rosé wine with a few rose petals beside it',
    lines: [
      'Rosé all day. Within limits.',
      'Pink, pretty and dangerously drinkable.',
    ],
  },
  prosecco: {
    name: 'Prosecco',
    emoji: '🥂',
    price: 8,
    category: 'wine',
    alcohol: true,
    art: false,
    imagePrompt: 'a flute glass of sparkling prosecco with tiny rising bubbles',
    lines: [
      'Bubbles! Are we celebrating something?',
      'Fizzy, fancy and gone too fast.',
    ],
  },

  // 🎃 Halloween only (October 31)
  witchbrew: {
    name: "Witch's Brew",
    emoji: '🧪',
    price: 8,
    category: 'halloween',
    caffeine: true,
    halloween: true,
    art: false,
    imagePrompt:
      'a bubbling dark purple-green coffee drink in a small witch cauldron mug with glowing swirls and tiny bats',
    lines: [
      'Eye of newt, double shot, extra foam. Don’t ask what’s bubbling.',
      'Brewed at midnight under a full moon. Or in the microwave. Same thing.',
    ],
  },
  vampire: {
    name: 'Vampire Latte',
    emoji: '🩸',
    price: 8,
    category: 'halloween',
    caffeine: true,
    halloween: true,
    art: true,
    imagePrompt:
      'a gothic black latte cup with blood-red raspberry syrup dripping down the side, on a dark lace doily',
    lines: [
      'Raspberry syrup. It’s raspberry. Definitely raspberry.',
      'Best enjoyed after sunset. Garlic not included.',
    ],
  },
};

const SECRETS = [
  'cardamom',
  'a pinch of sea salt',
  'vanilla',
  'honey',
  'lavender',
  'cinnamon',
  'orange zest',
  'a marshmallow',
  'stardust',
  'pure chaos',
];
// Latte art designs. `key` is used in picture file names (e.g. latte-cat.png).
const LATTE_ART = [
  { key: 'heart', text: 'a heart 🤍', imagePrompt: 'a classic heart' },
  { key: 'bird', text: 'a little bird 🐦', imagePrompt: 'a cute little bird' },
  {
    key: 'nest',
    text: 'a nest 🪺',
    imagePrompt: 'a small bird nest with eggs',
  },
  { key: 'cat', text: 'a cat 🐱', imagePrompt: 'a cute cat face' },
  {
    key: 'leaf',
    text: 'a leaf 🍃',
    imagePrompt: 'a rosetta leaf (fern pattern)',
  },
  { key: 'star', text: 'a star ⭐', imagePrompt: 'a star' },
  {
    key: 'swan',
    text: 'a very confused swan 🦢',
    imagePrompt: 'a swan with a funny, confused expression',
  },
  {
    key: 'moon',
    text: 'a tiny moon 🌙',
    imagePrompt: 'a crescent moon with tiny stars',
  },
];
// Shown from JITTERY_AT caffeinated drinks on ({n} = how many today)
const JITTERY_LINES = [
  'Your hands are shaking a little. Just saying.',
  'This is caffeinated drink number {n}. I’m starting to worry.',
  'You are vibrating at a frequency only dogs can hear.',
];
// Shown when the caffeine limit is reached
const CUT_OFF_LINES = [
  "No. {n} caffeinated drinks is enough. I'm cutting you off until tomorrow. Have a chamomile tea.",
  'The coffee machine is closed. For you. Specifically. Come back tomorrow.',
];
// Shown from TIPSY_AT alcoholic drinks on
const TIPSY_LINES = [
  'You’re getting a little giggly. Just saying.',
  'Drink number {n}. Maybe have some water in between?',
  'You just told me I’m your best friend. Twice.',
];
// Shown when the alcohol limit is reached
const BAR_CLOSED_LINES = [
  "That's {n}. The bar is closed for you tonight. Here's a glass of water. 🚰",
  'Last call was a while ago. Go home, you’re tipsy.',
];
// Shown when the total limit is reached
const FULL_LINES = [
  '{n} drinks today? Your tummy is full. Come back tomorrow.',
  'Even the Nest has limits. You reached them. See you tomorrow!',
];

module.exports = {
  CAFFEINE_LIMIT,
  JITTERY_AT,
  ALCOHOL_LIMIT,
  TIPSY_AT,
  TOTAL_LIMIT,
  LUCKY_CHANCE,
  LATTE_ART_CHANCE,
  CATEGORIES,
  MENU,
  SECRETS,
  LATTE_ART,
  JITTERY_LINES,
  CUT_OFF_LINES,
  TIPSY_LINES,
  BAR_CLOSED_LINES,
  FULL_LINES,
};
