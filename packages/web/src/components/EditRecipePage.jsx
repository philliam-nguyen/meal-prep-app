import { updateRecipe } from '../api.js';
import { RecipeForm } from './RecipeForm.jsx';

// Correcting a Recipe from inside the app, which is what the spreadsheet used to provide by hand
// (stories 28, 29 and 30). The same form the Add page uses, so a correction is held to the rules a
// new Recipe is held to.
//
// The whole Recipe is sent, including the Recipe Ingredients, because that is what is on screen.
// Adding a row, removing one, or changing a quantity are all the one save.

export function EditRecipePage({ recipe, onSaved, onCancel, toast }) {
  const handleSave = async (payload) => {
    await updateRecipe(recipe.id, payload);
    toast(`"${payload.name}" saved!`);
    onSaved();
  };

  return (
    <div className="fade-in">
      <RecipeForm
        initial={recipe}
        saveLabel="Save Changes"
        onSave={handleSave}
        onCancel={onCancel}
        toast={toast}
      />
    </div>
  );
}
