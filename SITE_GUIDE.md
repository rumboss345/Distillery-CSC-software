# CSC Distillery Tracker

This site is the production record for the distillery. It follows spirit from the wash tank to the bottle: who made it, which vessel held it, how strong it was, and where it went next.

Sign in at the front page. People who do not have an account can request access. An administrator approves or rejects that request. Administrators see every area. Other people see only the areas they were given, such as Wash, Distillation, or Bottling. The menu on a phone is behind the Menu button at the top.

Your production records stay in this browser. They do not follow you to another computer. Sign-in itself is checked by the server.

## How a batch moves through the site

1. **Recipes** holds the wash formula and the blend formula.
2. **Wash** records sugar, water, yeast, and the wash tank.
3. **Fermentation** starts one fermenter at a time and keeps daily logs for that fermenter.
4. **Distillation** charges a still from a fermenter or a holding tank, then records cuts.
5. **Tank Transfer** moves spirit between tanks, or moves leftover wash between fermenters.
6. **Blending** builds a finished recipe from tanks or barrels, proofs it, and puts the batch in an output tank.
7. **Barrel Aging** fills barrels from holding tanks and keeps them in warehouse locations.
8. **Bottling** empties a tank or a barrel into bottles.

**Calendar** and **Equipment** sit beside that path. Calendar shows what is planned or already done on a date. Equipment shows the vessels on the floor and what is in them.

## Production

### Dashboard

The home page counts active fermentations (one per fermenter), distillation runs that are planned or running, barrels aging, hearts collected, bottles filled this month, and inventory items at or below their reorder level. Under those counts are the latest wash batches, distillation runs, aging barrels, and low-stock items.

An administrator can clear every production record and return to sample data. The site asks twice before it does that.

### Calendar

Month, week, and day views of washes, fermentations, still runs, blends, and bottling. Filter by status. Pick a day and plan a new batch on that day. A planned event does not lock the equipment; the vessel can still be used.

### Equipment

Two views of the same floor.

**Process** is the live view. Tanks, fermenters, and stills show what they hold, including volume and proof where that applies. Select a piece of equipment for its details. Right-click (or long-press on a phone) for the actions that piece can take. A red X means the vessel is broken or in maintenance and cannot be used. A mop means it was emptied and still needs to be marked clean.

**Floor plan** is the room layout. Drag equipment to place it. Add pages when one room is not enough. Add an equipment type when the built-in list does not have what you need, and delete a type that was added by mistake and is not in use. Empty All Tanks clears spirit from the holding tanks. That is a floor-wide action, so use it only when the tanks really are empty.

## Make

### Wash

A wash batch is the cook: recipe, sugar in pounds, batch size in gallons, yeast, nutrients, wash tank, and who is assigned. Status groups are Planned, Washing, Fermenting, Complete, and Discarded. Recent completed and discarded batches stay on this page; the full list is under Reports.

Fermentation logs are not entered here. Use Ferment on a planned or washing batch to open Fermentation for that wash.

### Fermentation

Each fermenter is its own fermentation, even when two fermenters come from the same wash. Each one has its own logs, Brix, and status. The estimated alcohol from Brix is shown on the fermenter. Unusable gallons can be recorded as leftovers without throwing away the fermentation.

A fermenter that has finished stays assigned until the still is charged from it. After it is emptied it stays dirty until someone marks it cleaned on Equipment Maintenance. Deleting a finished fermentation, or the logs of one that was already distilled, requires an administrator email and password.

### Distillation

Three kinds of run:

- **Low Wine Run** charges a fermenter. Brix below 10° is the recommended point before charging.
- **Spirit Run** charges a holding tank, not a fermenter.
- **Heavy Rum** also charges a fermenter.

Runs are grouped as Planned, Running, and Complete. A planned run does not block the still. A running run does: the same still cannot be charged twice.

Cuts are heads, hearts, and tails. Each cut names the collection vessel or tank it went into, with volume and alcohol percent. A run cannot be marked complete until it has logs and cuts. Alcohol percent cannot be entered above 99.

Stillage from a finished run goes only to a stillage tank, or it is discarded. It is not transferred into a spirit tank.

### Tank Transfer

Move spirit from one holding tank or collection vessel into another. The amount starts as the full volume in the source. The source list shows what is actually in that vessel.

Fermenters are listed separately. Wash in a fermenter can be moved to another fermenter, or the gallons that cannot be used are recorded as leftovers.

## Finish

### Blending

Two modes: **Batches** and **Designer**.

A tank batch or a barrel blend walks through nine steps:

1. Choose a saved recipe and a batch size. Sugar scales in whole 50 lb bags.
2. Choose the source tanks or barrels. If the tank is stronger or weaker than the recipe, the pull changes so the batch stays the same size and still hits the target alcohol. Proofing water moves by the opposite gallons.
3. Add sugar, syrup, flavor, and color before any proofing water.
4. Set the target alcohol percent. Water is calculated with those additives already in the batch.
5. Review every line in gallons and liters, and in pounds and kilograms.
6. Enter the lab result. If it is off, correct the batch from this step.
7. Approve the recipe for production.
8. Choose the output tank and produce. Spirit leaves the source tanks and ingredients leave inventory. Undoing a produced batch requires an administrator email and password.
9. Verify the finished weight or volume.

The designer is a calculator for a formula before you commit a batch. It shows spirit, water, sugar, and the finished blend in both volume and weight. Once sugar or flavor is in a blend, do not turn a density reading into proof. The lab alcohol percent is the number to trust.

### Spirit Calculator

A gauging desk. It does not move liquid by itself.

- **Weight and gauging** turns a weight or a volume plus alcohol percent into proof gallons, using TTB Table No. 3 at 60 °F. If you enter a sample temperature, the alcohol percent is corrected to 60 °F first.
- **Alcohol dilution** says how much water to add to go from one alcohol percent to a lower one. Mixing includes the contraction of alcohol and water.
- **Density and sugar** estimates sugar in a blend. A sweet spirit’s density is not its proof.
- **Batch correction** says what to add when a measured batch misses its target volume or proof.
- **Volume converter** and **Weight converter** switch among gallons, liters, pounds, and kilograms.

Water weight uses the TTB factor of 0.120074 wine gallons per pound at 60 °F, about 8.328 pounds per gallon. Dissolved sugar is treated as adding 0.6219 milliliters per gram. Class I caramel color is weighed at a specific gravity of 1.30, which is typical for that class and is not a lot sheet for one color. CS1 syrup stays at the plant sheet density. A flavor with its own alcohol percent is gauged like spirit. A flavor with no alcohol percent is weighed as water.

### Barrel Aging

Barrels are grouped by warehouse location. Each location lists the barrel heads, oldest first. Select a barrel for its fill date, age, volume, and proof. New fills come from holding tanks. Search by barrel when the warehouse is large.

### Bottling

A bottling run draws from a holding tank or from a barrel and records the bottles filled and the lot. Packaging bottle sizes are the bottle items kept in Inventory. If the tank is emptied and the bottles do not match the gallons drawn, the difference is shown as a variance. Alcohol percent cannot be entered above 99.

## Reference

### Inventory

Sugar, yeast, nutrients, barrels, bottles, labels, and any other supplies. Add an item or add a category. Each item has a quantity and a reorder level. The dashboard flags items at or below that level. A batch is allowed to drive a count below zero when the floor uses more than the book count.

### Recipes

**Wash** recipes name the spirit, the sugar, the water, the yeast, the nutrients, and the target Brix. Nutrients use the same kind of units as yeast.

**Blend** recipes are the formulas used by the blending wizard: spirit pulls, sugar, flavor, color, proofing water, and the target alcohol percent. The distillery’s 2024 formulas are seeded here for a new browser. Changing a saved recipe does not rewrite batches that already used an older version.

### Equipment Maintenance

Mark a vessel broken or under maintenance. That blocks production and shows the red X on the process view. Record who returned it to service. Emptied vessels stay dirty, with a mop on the process view, until someone records a cleaning. The log under the list is the history of those actions.

### Reports

Reports read the same production records. They do not keep a second set of books. Pick a period, then open a section:

- **Summary** for the period as a whole
- **Wash**, **Fermentation**, **Distillation**, **Tanks**, **Blending**, and **Bottling** for each step
- **Movements** for transfers
- **Exceptions** for records that need a look
- **Traceability** for the path from a wash or a tank through to bottles

Lists on the working pages keep only the recent completed records. The matching report is where the older history stays.

## Admin

Only an administrator sees **Administration**.

- Approve or reject people who requested access
- Add a user directly
- Choose which areas each person can open
- Assign which parts of the floor they work: mash and cook, fermenters, distillation, holding tanks, or other equipment

Deleting a finished fermentation, deleting distilled fermenter logs, and undoing a produced blend all ask for an administrator email and password at the moment they happen.

## Rules the site will not bend

- Alcohol percent is capped at 99.
- A still that is already running cannot be charged again.
- A planned run or a planned wash does not take the equipment out of service.
- Stillage goes to a stillage tank or is discarded.
- Equipment marked broken or in maintenance cannot be used in production.
- Emptied equipment stays dirty until it is marked cleaned.
- Sugared or flavored blends are proved by the lab result, not by a density reading.
