import type { FoodEvent } from "./events";

/**
 * Pick an emoji for an event's food, so a pin says what is on offer before you
 * click it.
 *
 * The rules are ordered most specific first and the first match wins, because
 * the text is free-form and often overlaps — "coffee and pastries" should read
 * as pastries rather than stopping at the drink, and "boba" must beat "tea".
 *
 * The vocabulary comes from the events table rather than guesswork: `lunch`,
 * `snacks`, `coffee`, `tea`, `treats`, `pastries` and `refreshments` carry most
 * of the weight, with pizza, bbq, donuts and candy appearing occasionally.
 */
const RULES: [RegExp, string][] = [
  [/\bboba|bubble tea|milk tea/, "🧋"],
  [/\bpizza\b/, "🍕"],
  [/\bwine|sangria|mimosa/, "🍷"],
  [/\bbeer|cider\b/, "🍺"],
  [/\bice cream|gelato|froyo|frozen yogurt|popsicle/, "🍦"],
  [/\bdonut|doughnut/, "🍩"],
  [/\bcupcake|\bcake\b|brownie|baklava|dessert|sweet treat/, "🧁"],
  [/\bcookie|baked good|pastr|croissant|scone|muffin/, "🥐"],
  [/\bcandy|chocolate|halloween/, "🍬"],
  [/\btaco|burrito|quesadilla|mexican|chipotle|nacho/, "🌮"],
  [/\bramen|noodle|sushi|miso|dumpling|asian|thai|chinese|korean/, "🍜"],
  [/\bbbq|barbecue|grill|burger/, "🍔"],
  [/\bwings?\b|\bchicken\b|\bfried\b/, "🍗"],
  [/\bsandwich|\bsub\b|panini|bagel/, "🥪"],
  [/\bsalad|panzanella|veggie|vegetable|fruit/, "🥗"],
  [/\bpotluck|\bsoup\b|\bcurry\b|\bstew\b/, "🍲"],
  [/\bcoffee|latte|espresso|cold brew|cappuccino/, "☕"],
  [/\btea\b|chai|matcha/, "🍵"],
  [/\bbreakfast|pancake|waffle|brunch/, "🥞"],
  [/\bpopcorn|chips|pretzel|snack|treat/, "🍿"],
  [/\bdrink|beverage|refreshment|soda|juice|lemonade/, "🥤"],
  [/\blunch|dinner|meal|catered|buffet|food\b/, "🍽️"],
];

/** Emoji for this event, falling back to a plate when nothing matches. */
export function foodEmoji(e: FoodEvent): string {
  const text = `${e.food ?? ""} ${e.food_reason ?? ""} ${e.title}`.toLowerCase();
  for (const [pattern, emoji] of RULES) {
    if (pattern.test(text)) return emoji;
  }
  return "🍽️";
}
