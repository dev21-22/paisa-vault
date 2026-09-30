// Built-in guesses for common Indian merchants and payment words, used when you have
// no rule or history for a note yet. Names must match the default category names in store.js.

const EXPENSE = [
  ['Food & dining', ['swiggy', 'zomato', 'eatsure', 'dominos', 'pizza', 'mcdonald', 'kfc', 'burger', 'starbucks', 'cafe', 'restaurant', 'hotel', 'dhaba', 'chai', 'tea', 'coffee', 'biryani', 'haldiram', 'barbeque']],
  ['Groceries', ['bigbasket', 'blinkit', 'zepto', 'instamart', 'dmart', 'd mart', 'jiomart', 'reliance fresh', 'more retail', 'spencer', 'grocery', 'kirana', 'milk', 'vegetable', 'sabzi', 'fruits', 'dairy', 'nature basket', 'star bazaar', 'bb daily', 'country delight']],
  ['Travel & fuel', ['uber', 'ola', 'rapido', 'irctc', 'redbus', 'makemytrip', 'goibibo', 'indigo', 'air india', 'akasa', 'spicejet', 'vistara', 'metro', 'fastag', 'petrol', 'diesel', 'fuel', 'indian oil', 'iocl', 'hpcl', 'bpcl', 'shell', 'parking', 'toll', 'cab', 'auto', 'train', 'bus', 'flight', 'yulu']],
  ['Shopping', ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'tata cliq', 'croma', 'reliance digital', 'decathlon', 'ikea', 'lifestyle', 'westside', 'zudio', 'pantaloons', 'shoppers stop', 'h&m', 'uniqlo', 'lenskart', 'firstcry']],
  ['Bills & utilities', ['electricity', 'bescom', 'msedcl', 'tneb', 'tata power', 'adani electricity', 'bses', 'water bill', 'gas bill', 'indane', 'bharat gas', 'hp gas', 'piped gas', 'mahanagar gas', 'igl', 'broadband', 'act fibernet', 'hathway', 'maintenance', 'society']],
  ['Rent', ['rent', 'house rent', 'pg rent', 'nobroker']],
  ['Health', ['pharmacy', 'medical', 'apollo', 'medplus', 'netmeds', 'pharmeasy', '1mg', 'tata 1mg', 'hospital', 'clinic', 'doctor', 'diagnostic', 'lab', 'practo', 'cult fit', 'cultfit', 'gym']],
  ['Education', ['school', 'college', 'tuition', 'fees', 'udemy', 'coursera', 'byju', 'unacademy', 'books', 'stationery']],
  ['Entertainment', ['bookmyshow', 'pvr', 'inox', 'cinepolis', 'movie', 'steam', 'playstation', 'concert']],
  ['Recharge & subscriptions', ['jio', 'airtel', 'vodafone', 'vi ', 'bsnl', 'recharge', 'netflix', 'hotstar', 'jiocinema', 'prime video', 'amazon prime', 'spotify', 'youtube premium', 'sonyliv', 'zee5', 'apple.com', 'google play', 'icloud', 'dth', 'tata play', 'dish tv', 'chatgpt', 'claude']],
  ['EMI & loans', ['emi', 'loan', 'bajaj finserv', 'home loan', 'car loan', 'nach', 'ach debit']],
  ['Gifts & family', ['gift', 'donation', 'temple', 'wedding', 'shagun', 'birthday']],
];

const INCOME = [
  ['Salary', ['salary', 'sal credit', 'payroll', 'stipend']],
  ['Interest & returns', ['interest', 'int.pd', 'int pd', 'dividend', 'cashback', 'refund', 'maturity', 'redemption']],
  ['Business', ['invoice', 'client', 'consulting', 'freelance']],
];

export function builtinCategoryName(text, type) {
  const t = ` ${String(text || '').toLowerCase()} `;
  const table = type === 'income' ? INCOME : type === 'expense' ? EXPENSE : [];
  for (const [name, words] of table) {
    if (words.some((w) => t.includes(w))) return name;
  }
  return null;
}
