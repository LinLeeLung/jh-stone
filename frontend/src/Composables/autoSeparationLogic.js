export function applySeparationItems({ isSep, itemList, totalFrontEdgeLength }) {
  if (!Array.isArray(itemList.value)) return;

  let changed = false;

  const updatedList = itemList.value.map(item => {
    const isStar = typeof item.name === 'string' && item.name.includes('★');
    const newItem = { ...item };

    if (isSep.value && isStar) {
      if (!newItem.checked || newItem.amount === 0) changed = true;
      newItem.checked = true;

      if (newItem.id === 'frontEdge45') {
        const newAmount = parseFloat(totalFrontEdgeLength.value) || 0;
        if (newItem.amount !== newAmount) {
          newItem.amount = newAmount;
          changed = true;
        }
      } else if (!newItem.amount) {
        newItem.amount = 1;
        changed = true;
      }

    } else if (!isSep.value && isStar) {
      if (newItem.checked || newItem.amount !== 0) changed = true;
      newItem.checked = false;
      newItem.amount = 0;
    }

    return newItem;
  });

  if (changed) {
    // console.log('[applySeparationItems] itemList changed，進行更新');
    itemList.value = updatedList;
  } else {
    // console.log('[applySeparationItems] 無變動，略過更新');
  }
}
