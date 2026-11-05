import { formatBlendRecipeAdditive, formatBlendRecipeSpiritPull } from '../lib/blending';
import { formatDateDisplay } from '../lib/date-input';
import { formatAbvDisplay, formatGallonDisplay } from '../lib/formulation-quantity';
import { formatGinBotanicalLine } from '../lib/gin-botanicals';
import { localIsoDate } from '../lib/planned-event-date';
import { formatRecipeNutrientLine } from '../lib/wash-recipe-nutrients';
import type { BlendRecipeView, GinRecipe, RecipeView } from '../types';

function linesOf(items: Array<string | null | undefined | false>): string[] {
  return items.filter((item): item is string => Boolean(item && item.trim()));
}

function WashRecipeCard({ recipe }: { recipe: RecipeView }) {
  const lines = linesOf([
    recipe.spirit_type && `Spirit type: ${recipe.spirit_type}`,
    (recipe.grain_type || recipe.grain_lbs > 0) && `Sugar: ${recipe.grain_type || 'Sugar'}${recipe.grain_lbs > 0 ? `, ${recipe.grain_lbs} lbs` : ''}`,
    recipe.water_gal > 0 && `Batch size: ${recipe.water_gal} gal`,
    (recipe.yeast_strain || recipe.yeast_lbs > 0) && `Yeast: ${recipe.yeast_strain || 'Yeast'}${recipe.yeast_lbs > 0 ? `, ${recipe.yeast_lbs} lbs` : ''}`,
    recipe.target_brix != null && `Target start Brix: ${recipe.target_brix}`,
    recipe.target_final_brix != null && `Target final Brix: ${recipe.target_final_brix}`,
  ]);
  const nutrients = recipe.nutrients.filter((nutrient) => nutrient.amount > 0 && nutrient.name.trim());

  return (
    <article className="recipe-print-card">
      <h3>{recipe.name}</h3>
      {lines.length > 0 && (
        <ul>
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {nutrients.length > 0 && (
        <>
          <h4>Nutrients</h4>
          <ul>
            {nutrients.map((nutrient) => (
              <li key={nutrient.id}>{formatRecipeNutrientLine(nutrient)}</li>
            ))}
          </ul>
        </>
      )}
      {recipe.notes.trim() && <p>{recipe.notes}</p>}
    </article>
  );
}

function GinRecipeCard({ recipe }: { recipe: GinRecipe }) {
  const botanicals = recipe.botanicals.filter((line) => line.name.trim() && line.weight > 0);

  return (
    <article className="recipe-print-card">
      <h3>{recipe.name}</h3>
      {botanicals.length > 0 && (
        <ul>
          {botanicals.map((line) => (
            <li key={line.id}>{formatGinBotanicalLine(line)}</li>
          ))}
        </ul>
      )}
      {recipe.notes.trim() && <p>{recipe.notes}</p>}
    </article>
  );
}

function BlendRecipeCard({ recipe }: { recipe: BlendRecipeView }) {
  const lines = linesOf([
    recipe.product_name.trim() && recipe.product_name.trim() !== recipe.name.trim() && `Product: ${recipe.product_name.trim()}`,
    `Source: ${recipe.source_type === 'barrel' ? 'Barrels' : 'Holding tanks'}`,
    recipe.target_abv != null && `Target ABV: ${formatAbvDisplay(recipe.target_abv)}`,
    recipe.target_brix != null && `Target Brix: ${recipe.target_brix}`,
    recipe.target_sugar_g_per_l != null && `Target sugar: ${recipe.target_sugar_g_per_l} g/L`,
    recipe.target_volume_gal != null && recipe.target_volume_gal > 0 && `Target volume: ${formatGallonDisplay(recipe.target_volume_gal)} gal`,
    recipe.scale_factor !== 1 && `Scale: ${recipe.scale_factor}×`,
    recipe.current_version_number != null && `Version ${recipe.current_version_number}`,
  ]);
  const spirits = recipe.spirit_sources.filter((source) => source.volume_gal > 0 || source.spirit_label.trim());
  const ingredients = recipe.ingredients.filter((ingredient) => ingredient.amount > 0 || ingredient.name.trim());

  return (
    <article className="recipe-print-card">
      <h3>{recipe.name}</h3>
      {lines.length > 0 && (
        <ul>
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {spirits.length > 0 && (
        <>
          <h4>Spirits</h4>
          <ul>
            {spirits.map((source) => (
              <li key={source.id}>
                {formatBlendRecipeSpiritPull(source.spirit_label, source.volume_gal, source.abv, {
                  amount: source.entered_amount,
                  unit: source.entered_unit,
                })}
              </li>
            ))}
          </ul>
        </>
      )}
      {ingredients.length > 0 && (
        <>
          <h4>Ingredients</h4>
          <ul>
            {ingredients.map((ingredient) => (
              <li key={ingredient.id}>{formatBlendRecipeAdditive(ingredient)}</li>
            ))}
          </ul>
        </>
      )}
      {recipe.notes.trim() && <p>{recipe.notes}</p>}
    </article>
  );
}

/** Floor copy of the saved formulas. Hidden on screen and shown when printing. */
export function RecipePrintSheet({
  wash,
  gin,
  blend,
}: {
  wash: RecipeView[];
  gin: GinRecipe[];
  blend: BlendRecipeView[];
}) {
  return (
    <div className="recipe-print-sheet" aria-hidden="true">
      <h1>Recipes</h1>
      <p className="recipe-print-date">{formatDateDisplay(localIsoDate())}</p>
      {wash.length > 0 && (
        <section>
          <h2>Wash &amp; Fermentation</h2>
          {wash.map((recipe) => <WashRecipeCard key={recipe.id} recipe={recipe} />)}
        </section>
      )}
      {gin.length > 0 && (
        <section>
          <h2>Gin</h2>
          {gin.map((recipe) => <GinRecipeCard key={recipe.id} recipe={recipe} />)}
        </section>
      )}
      {blend.length > 0 && (
        <section>
          <h2>Blending</h2>
          {blend.map((recipe) => <BlendRecipeCard key={recipe.id} recipe={recipe} />)}
        </section>
      )}
    </div>
  );
}
