// Emoji for an event's food, so a pin says what's on offer before you tap it (Snackpass-style).
// Rules from Mohul's mohul-web branch: most specific first, first match wins ("boba" beats "tea",
// "coffee and pastries" reads as pastries).
import type { FoodEvent } from './events';

const RULES: [RegExp, string][] = [
  [/\bboba|bubble tea|milk tea/, '🧋'],
  [/\bpizza\b/, '🍕'],
  [/\bwine|sangria|mimosa/, '🍷'],
  [/\bbeer|cider\b/, '🍺'],
  [/\bice cream|gelato|froyo|frozen yogurt|popsicle/, '🍦'],
  [/\bdonut|doughnut/, '🍩'],
  [/\bcupcake|\bcake\b|brownie|baklava|dessert|sweet treat/, '🧁'],
  [/\bcookie|baked good|pastr|croissant|scone|muffin/, '🥐'],
  [/\bcandy|chocolate|halloween/, '🍬'],
  [/\btaco|burrito|quesadilla|mexican|chipotle|nacho/, '🌮'],
  [/\bramen|noodle|sushi|miso|dumpling|asian|thai|chinese|korean/, '🍜'],
  [/\bbbq|barbecue|grill|burger/, '🍔'],
  [/\bwings?\b|\bchicken\b|\bfried\b/, '🍗'],
  [/\bsandwich|\bsub\b|panini|bagel/, '🥪'],
  [/\bsalad|panzanella|veggie|vegetable|fruit/, '🥗'],
  [/\bpotluck|\bsoup\b|\bcurry\b|\bstew\b/, '🍲'],
  [/\bcoffee|latte|espresso|cold brew|cappuccino/, '☕'],
  [/\btea\b|chai|matcha/, '🍵'],
  [/\bbreakfast|pancake|waffle|brunch/, '🥞'],
  [/\bpopcorn|chips|pretzel|snack|treat/, '🍿'],
  [/\bdrink|beverage|refreshment|soda|juice|lemonade/, '🥤'],
  [/\blunch|dinner|meal|catered|buffet|food\b/, '🍽️'],
];

/** Emoji for this event, falling back to a plate when nothing matches. */
export function foodEmoji(e: FoodEvent): string {
  const text = `${e.food ?? ''} ${e.food_reason ?? ''} ${e.title}`.toLowerCase();
  return RULES.find(([pattern]) => pattern.test(text))?.[1] ?? '🍽️';
}
