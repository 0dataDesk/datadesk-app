function formatNum(value, decimals = 2) {
  const num = parseFloat(value)
  if (isNaN(num)) return '—'
  return num.toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
window.formatNum = formatNum

function formatInt(value) {
  return formatNum(value, 0)
}
window.formatInt = formatInt
