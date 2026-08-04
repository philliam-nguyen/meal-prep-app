export function computeShoppingList(recipes, ingredients, prev) {
  const activeIds = new Set(recipes.filter(r => r.inShoppingList).map(r => r.id));
  const map = {};
  for (const ing of ingredients.filter(i => activeIds.has(i.recipeId))) {
    const key = ing.ingredient.toLowerCase().trim();
    if (!map[key]) {
      const ex = prev.find(s => s.ingredient.toLowerCase().trim() === key) || {};
      map[key] = { ingredient: ing.ingredient, total: 0, unit: ing.unit, gotIt: ex.gotIt || false, aisle: ex.aisle || '', rowIndex: ex.rowIndex || -1 };
    }
    map[key].total += parseFloat(ing.quantity) || 0;
  }
  return Object.values(map);
}
