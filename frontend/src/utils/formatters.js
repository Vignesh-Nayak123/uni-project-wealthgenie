/**
 * Indian Number and Currency Formatters (en-IN)
 */

/**
 * Format a number into standard Indian Rupee currency format
 * Example: 125000 -> ₹1,25,000
 * 
 * @param {number|string} amount
 * @param {boolean} includeSymbol - whether to prepend ₹
 * @returns {string}
 */
export function formatINR(amount, includeSymbol = true) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return includeSymbol ? '₹0' : '0';
  }

  const num = Math.round(Number(amount));
  const formatted = new Intl.NumberFormat('en-IN').format(num);
  return includeSymbol ? `₹${formatted}` : formatted;
}

/**
 * Format a number into abbreviated Indian units (Lakhs / Crores)
 * Example: 150000 -> ₹1.5 Lakh, 20000000 -> ₹2.0 Crore
 * 
 * @param {number|string} amount
 * @returns {string}
 */
export function formatLakhCrore(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₹0';
  }

  const num = Number(amount);
  if (num >= 10000000) {
    return `₹${(num / 10000000).toFixed(2)} Cr`;
  }
  if (num >= 100000) {
    return `₹${(num / 100000).toFixed(2)} L`;
  }
  return formatINR(num);
}
