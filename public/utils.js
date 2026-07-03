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

// Plataformas de delivery disponibles como forma de pago (id en minúsculas, sin acentos — coincide con ventas.pagos_detalle[0].tipo)
const PLATAFORMAS_DELIVERY = { didi: 'Didi', rappi: 'Rappi', uber: 'Uber' }
window.PLATAFORMAS_DELIVERY = PLATAFORMAS_DELIVERY

// Texto legible para metodo_pago de una venta (agrega la plataforma cuando metodo_pago es 'delivery')
function formatMetodoPago(metodoPago, pagosDetalle) {
  if (metodoPago === 'delivery') {
    const tipo = Array.isArray(pagosDetalle) && pagosDetalle[0] ? pagosDetalle[0].tipo : null
    return 'Delivery' + (tipo ? ' · ' + (PLATAFORMAS_DELIVERY[tipo] || tipo) : '')
  }
  return metodoPago || '—'
}
window.formatMetodoPago = formatMetodoPago

// Etiqueta legible para una clave de desglose por método de pago (incluye sub-claves delivery_<plataforma>)
function formatMetodoKey(key) {
  if (!key) return key
  if (key.startsWith('delivery_')) {
    const tipo = key.slice('delivery_'.length)
    return 'Delivery · ' + (PLATAFORMAS_DELIVERY[tipo] || tipo)
  }
  return key.charAt(0).toUpperCase() + key.slice(1)
}
window.formatMetodoKey = formatMetodoKey
