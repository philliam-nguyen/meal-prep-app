// The Seed: the fixture the Demo Variant is populated with and restored to.
//
// Written by hand rather than generated. Generated names read as nonsense, and an app built for one
// person is being shown off here, so the collection has to look like a collection somebody keeps.
// An anonymized export of real data was rejected outright: it would put the Demo Variant's one hard
// isolation requirement in the hands of a scrubbing script.
//
// Two properties are deliberate rather than incidental, and both serve the visitor's first gesture.
// Every Recipe Type is represented, so the browse list has range. And the same foods recur across
// Recipes - onion in seven of them, double cream in five, chicken stock in three - so that ticking a
// handful of Pantry Ingredients ranks most of the collection instead of matching one Recipe.
//
// Recipe Card URLs point at example.com, which is reserved for exactly this. A plausible-looking URL
// to a site that has never held these Recipes would be a broken link in a demo.

// Foods assumed always on hand. They never appear in the Pantry checklist and are never counted
// Missing, which is what keeps Best Matches from telling a visitor they are short of salt.
const STAPLES = [
  'Salt',
  'Black pepper',
  'Olive oil',
  'Butter',
  'Plain flour',
  'Caster sugar',
  'Water',
];

// Where each food is found. A property of the food itself rather than of any one trip, so the
// Shopping List arrives already sorted into the order a visitor walks the store.
const AISLES = {
  Ale: 'Drinks',
  Apple: 'Produce',
  Bacon: 'Meat & poultry',
  Banana: 'Produce',
  Basil: 'Produce',
  'Beef shin': 'Meat & poultry',
  'Black pepper': 'Herbs & spices',
  Butter: 'Dairy & eggs',
  Carrot: 'Produce',
  'Caster sugar': 'Baking',
  Celery: 'Produce',
  Cheddar: 'Dairy & eggs',
  'Chicken stock': 'Tins & jars',
  'Chicken thighs': 'Meat & poultry',
  Chickpeas: 'Tins & jars',
  'Dark chocolate': 'Baking',
  'Double cream': 'Dairy & eggs',
  Eggs: 'Dairy & eggs',
  Garlic: 'Produce',
  'Ground cumin': 'Herbs & spices',
  Honey: 'Tins & jars',
  Leek: 'Produce',
  Lemon: 'Produce',
  Milk: 'Dairy & eggs',
  Mushrooms: 'Produce',
  Oats: 'Dry goods',
  'Olive oil': 'Oils & vinegars',
  Onion: 'Produce',
  Paprika: 'Herbs & spices',
  Parsley: 'Produce',
  Pasta: 'Dry goods',
  'Plain flour': 'Baking',
  Potato: 'Produce',
  'Red lentils': 'Dry goods',
  Rice: 'Dry goods',
  Salt: 'Herbs & spices',
  Spinach: 'Produce',
  'Strong white flour': 'Baking',
  Thyme: 'Produce',
  'Tinned tomatoes': 'Tins & jars',
  Walnuts: 'Baking',
  // A Staple, and still shelved: Staples stay off the Pantry checklist but they do reach the
  // Shopping List when a Selected Recipe calls for one, and every entry there needs a section.
  Water: 'Drinks',
  Yeast: 'Baking',
};

// Two Recipes already on the Shopping List, so a visitor arrives at a list with something in it
// rather than at an empty page that needs explaining. These two share leek, double cream, butter and
// chicken stock, which is what makes the list show consolidation rather than a flat concatenation.
const SELECTED = ['Chicken and Leek Pie', 'Leek and Potato Soup'];

const RECIPES = [
  {
    name: 'Chicken and Leek Pie',
    type: 'Dinner',
    cardUrl: 'https://recipes.example.com/chicken-and-leek-pie',
    ingredients: [
      { name: 'Chicken thighs', quantity: 600, unit: 'g' },
      { name: 'Leek', quantity: 300, unit: 'g' },
      { name: 'Double cream', quantity: 150, unit: 'ml' },
      { name: 'Chicken stock', quantity: 300, unit: 'ml' },
      { name: 'Thyme', quantity: 3, unit: 'sprigs' },
      { name: 'Plain flour', quantity: 250, unit: 'g' },
      { name: 'Butter', quantity: 125, unit: 'g' },
      { name: 'Salt', quantity: null, unit: '' },
    ],
  },
  {
    name: 'Mushroom Stroganoff',
    type: 'Dinner',
    cardUrl: 'https://recipes.example.com/mushroom-stroganoff',
    ingredients: [
      { name: 'Mushrooms', quantity: 500, unit: 'g' },
      { name: 'Onion', quantity: 1, unit: '' },
      { name: 'Garlic', quantity: 2, unit: 'cloves' },
      { name: 'Double cream', quantity: 200, unit: 'ml' },
      { name: 'Paprika', quantity: 2, unit: 'tsp' },
      { name: 'Rice', quantity: 300, unit: 'g' },
      { name: 'Butter', quantity: 30, unit: 'g' },
    ],
  },
  {
    name: 'Roast Chicken Traybake',
    type: 'Dinner',
    cardUrl: 'https://recipes.example.com/roast-chicken-traybake',
    ingredients: [
      { name: 'Chicken thighs', quantity: 8, unit: '' },
      { name: 'Potato', quantity: 800, unit: 'g' },
      { name: 'Carrot', quantity: 4, unit: '' },
      { name: 'Lemon', quantity: 1, unit: '' },
      { name: 'Thyme', quantity: 4, unit: 'sprigs' },
      { name: 'Olive oil', quantity: 3, unit: 'tbsp' },
      { name: 'Black pepper', quantity: null, unit: '' },
    ],
  },
  {
    name: 'Spaghetti with Tomato and Basil',
    type: 'Dinner',
    cardUrl: 'https://recipes.example.com/spaghetti-tomato-basil',
    ingredients: [
      { name: 'Pasta', quantity: 400, unit: 'g' },
      { name: 'Tinned tomatoes', quantity: 800, unit: 'g' },
      { name: 'Garlic', quantity: 3, unit: 'cloves' },
      { name: 'Basil', quantity: 1, unit: 'bunch' },
      { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
      { name: 'Salt', quantity: null, unit: '' },
    ],
  },
  {
    name: 'Leek and Cheddar Tart',
    type: 'Lunch',
    cardUrl: 'https://recipes.example.com/leek-and-cheddar-tart',
    ingredients: [
      { name: 'Leek', quantity: 400, unit: 'g' },
      { name: 'Cheddar', quantity: 150, unit: 'g' },
      { name: 'Eggs', quantity: 3, unit: '' },
      { name: 'Double cream', quantity: 200, unit: 'ml' },
      { name: 'Plain flour', quantity: 200, unit: 'g' },
      { name: 'Butter', quantity: 100, unit: 'g' },
    ],
  },
  {
    name: 'Chickpea and Spinach Salad',
    type: 'Lunch',
    cardUrl: null,
    ingredients: [
      { name: 'Chickpeas', quantity: 400, unit: 'g' },
      { name: 'Spinach', quantity: 200, unit: 'g' },
      { name: 'Lemon', quantity: 1, unit: '' },
      { name: 'Parsley', quantity: 1, unit: 'bunch' },
      { name: 'Olive oil', quantity: 3, unit: 'tbsp' },
    ],
  },
  {
    name: 'Mushroom and Bacon Hash',
    type: 'Breakfast',
    cardUrl: 'https://recipes.example.com/mushroom-and-bacon-hash',
    ingredients: [
      { name: 'Potato', quantity: 600, unit: 'g' },
      { name: 'Mushrooms', quantity: 250, unit: 'g' },
      { name: 'Bacon', quantity: 6, unit: 'rashers' },
      { name: 'Onion', quantity: 1, unit: '' },
      { name: 'Parsley', quantity: 1, unit: 'handful' },
      { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
    ],
  },
  {
    name: 'Banana Oat Pancakes',
    type: 'Breakfast',
    cardUrl: 'https://recipes.example.com/banana-oat-pancakes',
    ingredients: [
      { name: 'Banana', quantity: 2, unit: '' },
      { name: 'Oats', quantity: 100, unit: 'g' },
      { name: 'Eggs', quantity: 2, unit: '' },
      { name: 'Milk', quantity: 200, unit: 'ml' },
      { name: 'Plain flour', quantity: 100, unit: 'g' },
      { name: 'Butter', quantity: 20, unit: 'g' },
    ],
  },
  {
    name: 'Leek and Potato Soup',
    type: 'Soup',
    cardUrl: 'https://recipes.example.com/leek-and-potato-soup',
    ingredients: [
      { name: 'Leek', quantity: 400, unit: 'g' },
      { name: 'Potato', quantity: 500, unit: 'g' },
      { name: 'Onion', quantity: 1, unit: '' },
      { name: 'Chicken stock', quantity: 800, unit: 'ml' },
      { name: 'Double cream', quantity: 100, unit: 'ml' },
      { name: 'Butter', quantity: 40, unit: 'g' },
      { name: 'Black pepper', quantity: null, unit: '' },
    ],
  },
  {
    name: 'Red Lentil and Carrot Soup',
    type: 'Soup',
    cardUrl: 'https://recipes.example.com/red-lentil-and-carrot-soup',
    ingredients: [
      { name: 'Red lentils', quantity: 200, unit: 'g' },
      { name: 'Carrot', quantity: 400, unit: 'g' },
      { name: 'Onion', quantity: 1, unit: '' },
      { name: 'Garlic', quantity: 2, unit: 'cloves' },
      { name: 'Chicken stock', quantity: 1, unit: 'l' },
      { name: 'Ground cumin', quantity: 1, unit: 'tsp' },
    ],
  },
  {
    name: 'Beef and Ale Stew',
    type: 'Stew',
    cardUrl: 'https://recipes.example.com/beef-and-ale-stew',
    ingredients: [
      { name: 'Beef shin', quantity: 900, unit: 'g' },
      { name: 'Onion', quantity: 2, unit: '' },
      { name: 'Carrot', quantity: 3, unit: '' },
      { name: 'Celery', quantity: 2, unit: 'sticks' },
      { name: 'Ale', quantity: 500, unit: 'ml' },
      { name: 'Thyme', quantity: 4, unit: 'sprigs' },
      { name: 'Plain flour', quantity: 2, unit: 'tbsp' },
    ],
  },
  {
    name: 'Chickpea and Tomato Stew',
    type: 'Stew',
    cardUrl: 'https://recipes.example.com/chickpea-and-tomato-stew',
    ingredients: [
      { name: 'Chickpeas', quantity: 800, unit: 'g' },
      { name: 'Tinned tomatoes', quantity: 400, unit: 'g' },
      { name: 'Onion', quantity: 1, unit: '' },
      { name: 'Garlic', quantity: 3, unit: 'cloves' },
      { name: 'Spinach', quantity: 200, unit: 'g' },
      { name: 'Ground cumin', quantity: 2, unit: 'tsp' },
      { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
    ],
  },
  {
    name: 'Dark Chocolate Mousse',
    type: 'Dessert',
    cardUrl: 'https://recipes.example.com/dark-chocolate-mousse',
    ingredients: [
      { name: 'Dark chocolate', quantity: 200, unit: 'g' },
      { name: 'Eggs', quantity: 4, unit: '' },
      { name: 'Double cream', quantity: 300, unit: 'ml' },
      { name: 'Caster sugar', quantity: 50, unit: 'g' },
    ],
  },
  {
    name: 'Apple and Walnut Crumble',
    type: 'Dessert',
    cardUrl: 'https://recipes.example.com/apple-and-walnut-crumble',
    ingredients: [
      { name: 'Apple', quantity: 6, unit: '' },
      { name: 'Walnuts', quantity: 75, unit: 'g' },
      { name: 'Oats', quantity: 100, unit: 'g' },
      { name: 'Plain flour', quantity: 150, unit: 'g' },
      { name: 'Butter', quantity: 100, unit: 'g' },
      { name: 'Caster sugar', quantity: 100, unit: 'g' },
    ],
  },
  {
    name: 'Lemon Posset',
    type: 'Dessert',
    cardUrl: 'https://recipes.example.com/lemon-posset',
    ingredients: [
      { name: 'Double cream', quantity: 600, unit: 'ml' },
      { name: 'Lemon', quantity: 3, unit: '' },
      { name: 'Caster sugar', quantity: 150, unit: 'g' },
    ],
  },
  {
    name: 'Overnight White Loaf',
    type: 'Bread',
    cardUrl: 'https://recipes.example.com/overnight-white-loaf',
    ingredients: [
      { name: 'Strong white flour', quantity: 500, unit: 'g' },
      { name: 'Yeast', quantity: 3, unit: 'g' },
      { name: 'Water', quantity: 350, unit: 'ml' },
      { name: 'Salt', quantity: 10, unit: 'g' },
    ],
  },
  {
    name: 'Cheddar and Thyme Soda Bread',
    type: 'Bread',
    cardUrl: 'https://recipes.example.com/cheddar-and-thyme-soda-bread',
    ingredients: [
      { name: 'Plain flour', quantity: 400, unit: 'g' },
      { name: 'Cheddar', quantity: 100, unit: 'g' },
      { name: 'Thyme', quantity: 2, unit: 'sprigs' },
      { name: 'Milk', quantity: 300, unit: 'ml' },
      { name: 'Butter', quantity: 25, unit: 'g' },
    ],
  },
  {
    name: 'Honey and Oat Flapjacks',
    type: 'Snack',
    cardUrl: 'https://recipes.example.com/honey-and-oat-flapjacks',
    ingredients: [
      { name: 'Oats', quantity: 300, unit: 'g' },
      { name: 'Honey', quantity: 100, unit: 'g' },
      { name: 'Butter', quantity: 150, unit: 'g' },
      { name: 'Caster sugar', quantity: 75, unit: 'g' },
    ],
  },
  {
    name: 'Spiced Roasted Chickpeas',
    type: 'Snack',
    cardUrl: null,
    ingredients: [
      { name: 'Chickpeas', quantity: 400, unit: 'g' },
      { name: 'Ground cumin', quantity: 1, unit: 'tsp' },
      { name: 'Paprika', quantity: 1, unit: 'tsp' },
      { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
      { name: 'Salt', quantity: null, unit: '' },
    ],
  },
];

export const SEED = {
  recipes: RECIPES,
  staples: STAPLES,
  aisles: AISLES,
  selected: SELECTED,
};
