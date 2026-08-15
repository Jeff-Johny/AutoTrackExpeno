/**
 * Static keyword → category dictionary. This is the second automatic guess
 * (after learned payee patterns, before AI) so most common Indian merchants
 * get categorized without ever calling an API. Keys must match category
 * names in DEFAULT_CATEGORIES / the categories table — extend the arrays as
 * you notice merchants that fall through to manual categorization.
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food & Stationary': [
    'swiggy', 'zomato', 'dominos', "domino's", 'pizza', 'kfc', 'mcdonald',
    'burger king', 'starbucks', 'cafe coffee day', 'restaurant', 'bakery',
    'stationery', 'stationary', 'bookstore',
  ],
  'Petrol + transport': [
    'uber', 'ola cabs', 'rapido', 'petrol', 'diesel', 'fuel', 'indian oil',
    'bharat petroleum', 'hp petrol', 'irctc', 'railway', 'metro', 'redbus',
    'cab', 'taxi',
  ],
  Household: [
    'bigbasket', 'blinkit', 'zepto', 'grofers', 'dmart', 'reliance fresh',
    'more supermarket', 'grocery', 'supermarket', 'gas agency', 'lpg',
    'electricity', 'water bill', 'broadband', 'wifi bill',
  ],
  'cloth + cosmetics': [
    'myntra', 'ajio', 'nykaa', 'lifestyle', 'pantaloons', 'westside', 'h&m',
    'zara', 'max fashion', 'clothing', 'footwear', 'salon', 'parlour',
    'parlor',
  ],
  Medical: [
    'apollo', 'medplus', 'netmeds', 'pharmeasy', 'pharmacy', 'hospital',
    'clinic', 'diagnostic', 'medical',
  ],
  outing: ['bookmyshow', 'pvr', 'inox', 'cinema', 'movie', 'amusement', 'resort'],
  'Car/bike maintenance': [
    'service center', 'service centre', 'garage', 'car wash',
    'bike service', 'tyre', 'battery', 'spare parts',
  ],
};

export function guessCategoryFromText(payee: string | null | undefined, text: string): string | null {
  const haystack = `${payee || ''} ${text}`.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => haystack.includes(kw))) {
      return category;
    }
  }
  return null;
}
