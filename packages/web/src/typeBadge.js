const typeBadgeColors = {
  dinner: { bg: '#E8F0E7', text: '#3D5A3C' }, stew: { bg: '#FDE8D8', text: '#8B5C3A' },
  soup: { bg: '#E3ECF5', text: '#3A5A8B' }, dessert: { bg: '#F5E0F0', text: '#7A3A6B' },
  bread: { bg: '#F5EDE3', text: '#7A6538' }, lunch: { bg: '#FFF3D6', text: '#7A6020' },
  breakfast: { bg: '#FFF0E0', text: '#8B5C3A' }, snack: { bg: '#E8F5E8', text: '#3A7A3A' },
  default: { bg: '#F0EBE3', text: '#5A5548' },
};

export function getTypeBadge(type) { return typeBadgeColors[(type || '').toLowerCase()] || typeBadgeColors.default; }
