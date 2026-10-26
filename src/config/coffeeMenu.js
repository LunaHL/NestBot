// ☕ The Nest Café: everything you might want to change lives here.
// Prices, drinks, serving lines, latte art and limits. The café code that
// uses this is in src/services/coffee.js and src/commands/coffee.js.
//
// Adding a drink: copy an entry in MENU, give it a new key (lowercase, no
// spaces; it's also used in picture file names) and restart the bot.
//   art: true      -> can get latte art (milky drinks)
//   halloween: true -> only orderable on October 31
//   imagePrompt    -> description used by `npm run coffee-art`

const DAILY_LIMIT = 6; // cups per person per day before NestBot cuts you off
const JITTERY_AT = 4; // from this many cups on, NestBot starts commenting
const LUCKY_BEAN_CHANCE = 0.05; // drink is free
const LATTE_ART_CHANCE = 0.35; // only for drinks with art: true

// ☕ The menu. Add, remove or reprice drinks here.
const MENU = {
  espresso: {
    name: 'Espresso',
    emoji: '☕',
    price: 3,
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
    art: false,
    imagePrompt: 'a tall glass of iced coffee with ice cubes and a straw',
    lines: ['Cold brew for hot heads.', 'Ice ice coffee.'],
  },
  pumpkin: {
    name: 'Pumpkin Spice Latte',
    emoji: '🎃',
    price: 7,
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
    art: false,
    imagePrompt: 'a plain, slightly sad-looking mug of decaf coffee',
    lines: [
      '…Decaf? In this economy? Fine.',
      'Here. It’s basically warm bean water. Enjoy, I guess.',
    ],
  },

  // 🎃 Halloween only (October 31)
  witchbrew: {
    name: "Witch's Brew",
    emoji: '🧪',
    price: 8,
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
const JITTERY_LINES = [
  'Your hands are shaking a little. Just saying.',
  'This is cup number {n}. I’m starting to worry.',
  'You are vibrating at a frequency only dogs can hear.',
];
const CUT_OFF_LINES = [
  "No. {n} cups is enough. I'm cutting you off until tomorrow. Drink some water.",
  'The café is closed. For you. Specifically. Come back tomorrow.',
];

module.exports = {
  DAILY_LIMIT,
  JITTERY_AT,
  LUCKY_BEAN_CHANCE,
  LATTE_ART_CHANCE,
  MENU,
  SECRETS,
  LATTE_ART,
  JITTERY_LINES,
  CUT_OFF_LINES,
};
