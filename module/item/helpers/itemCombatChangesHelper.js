
export class ItemCombatChangesHelper {
    static canHaveCombatChanges(item, rollData, action) {
        return this.isCombatChangeItemType(item) && item.combatChanges.hasCombatChange(action, rollData);
    }

    static isCombatChangeItemType(item) {
        return item.type === "feat" || item.type === "aura" || (item.type === "buff" && getProperty(item.data, "data.active")) || (item.type === "equipment" && getProperty(item.data, "data.equipped") === true && !getProperty(item.data, "data.melded"));
    }

    static getAllSelectedCombatChangesForRoll(items, attackType, rollData, allCombatChanges, rollModifiers, optionalFeatIds, optionalFeatRanges) {
        items.filter(o => this.isCombatChangeItemType(o)).forEach(i => {
            if (i.combatChanges.hasCombatChange(attackType, rollData)) {
                allCombatChanges = allCombatChanges.concat(i.combatChanges.getPossibleCombatChanges(attackType, rollData))
                rollModifiers.push(`${i.data.data.combatChangeCustomReferenceName || i.name}`)
            }
            if (i.combatChanges.hasCombatChange(attackType + 'Optional', rollData) && optionalFeatIds.indexOf(i._id) !== -1) {
                allCombatChanges = allCombatChanges.concat(i.combatChanges.getPossibleCombatChanges(attackType + 'Optional', rollData, optionalFeatRanges.get(i._id)))

                if (optionalFeatRanges.get(i._id)) {
                    let ranges = []
                    if (optionalFeatRanges.get(i._id).base) ranges.push(optionalFeatRanges.get(i._id).base)
                    if (optionalFeatRanges.get(i._id).slider1) ranges.push(optionalFeatRanges.get(i._id).slider1)
                    if (optionalFeatRanges.get(i._id).slider2) ranges.push(optionalFeatRanges.get(i._id).slider2)
                    if (optionalFeatRanges.get(i._id).slider3) ranges.push(optionalFeatRanges.get(i._id).slider3)
                    rollModifiers.push(`${i.data.data.combatChangeCustomReferenceName || i.name} (${ranges.join(", ")})`)
                }
                else
                    rollModifiers.push(`${i.data.data.combatChangeCustomReferenceName || i.name}`)

                i.addCharges(-1 * (i.data.data.combatChangesUsesCost === 'chargesPerUse' ? i.data.data?.uses?.chargesPerUse || 1 : optionalFeatRanges.get(i._id).base));
            }
        });
        return allCombatChanges;
    }
}
