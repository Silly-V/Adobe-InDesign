var GroupMover = {
	ElementPlacement : {  // an attempt to Illustratorize my Indesign
		"PLACEBEFORE" : 0,
		"PLACEAFTER" : 1,
		"PLACEATBEGINNING" : 2,
		"PLACEATEND" : 3
	},
	getPageItemTypeName : function (pageItem){
		return pageItem.constructor.name;
	},
	recordGroupStructure : function (targetGroup){ // map a tree structure of possible nested groups and siblings to a linear array
		function getGroupChildren(targetGroup, nestingLevel){
			var thisItem;
			for (var i = 0; i < targetGroup.pageItems.length; i++) {
				thisItem = targetGroup.pageItems[i];
				app.activeDocument.select(thisItem); // not sure why I chose to do selections, it seemed like something wasn't working when I wasn't.. or something
				thisItem = app.activeDocument.selection[0];
				linearItems.push({
					name : thisItem.name,
					id : thisItem.id,
					parentGroupId : thisItem.parent.id,
					parentGroupName : thisItem.parent.name,
					nestingLevel : nestingLevel,
					index : i,
					typename : GroupMover.getPageItemTypeName(thisItem)
				});
				if(thisItem instanceof Group){
					var newNestingLevel = nestingLevel + 1;
					getGroupChildren(thisItem, newNestingLevel);
				}
			}
		};
		var linearItems = [];
		var nestingLevel = 0;
		app.activeDocument.selection = null;
		getGroupChildren(targetGroup, nestingLevel);
		app.activeDocument.selection = null;
		return linearItems;
	},
	getTopParentGroup : function (targetGroup){ // go all the way up from current group to obtain the top-level parent group, if targetGroup is nested
		var topLevelGroup = targetGroup;
		var escapeCounter = 0;
		while(topLevelGroup.parent instanceof Group && escapeCounter < 1000){
			topLevelGroup = topLevelGroup.parent;
			escapeCounter += 1;
		}
		return topLevelGroup;
	},
	ungroupAllInScope : function (targetGroup, linearItems){ // ungroups all the groups in the document based on info inside the linearItems collection
		var doc = app.activeDocument;
		var sortedByNestLevel = linearItems.slice(0,).sort(function(a, b){ return a.nestingLevel < b.nestingLevel});
		// alert("First: " + sortedByNestLevel[sortedByNestLevel.length - 1].nestingLevel + ", Last: " + sortedByNestLevel[0].nestingLevel);
		// doc.select(targetGroup);
		var highestNestingLevel = sortedByNestLevel[0].nestingLevel;
		var thisItem, thisDocItem;
		for (var i = 0; i < linearItems.length; i++) {
			thisItem = linearItems[i];
			if(thisItem.typename == "Group"){
				thisDocItem = this.getAnyItemById(doc, thisItem.id);
				thisDocItem.ungroup();
			}
		}
		targetGroup.ungroup();
	},
	getAnyItemByName : function (doc, name){ // get items by name without targeting a specific collection or container
		var items = doc.allPageItems, thisItem;
		for (var i = 0; i < items.length; i++) {
			thisItem = items[i];
			if(thisItem.name == name){
				return thisItem;
			}
		}
		return null;
	},
	getAnyItemById : function (doc, id){
		var items = doc.allPageItems, thisItem;
		for (var i = 0; i < items.length; i++) {
			thisItem = items[i];
			if(thisItem.id == id){
				return thisItem;
			}
		}
		return null;
	},
	getByIdFromCollection : function (container, id){ // get item from my custom collection by the 'id' property
		var thisItem;
		for (var i = 0; i < container.length; i++) {
			thisItem = container[i];
			if(thisItem.id == id){
				return thisItem;
			}
		}
		return null;
	},
	// get stacking order recording inside a layer. Uwe: https://forums.adobe.com/message/8274339#8274339
	getLayerItemsInOrder : function (container, targetLayer){
		var allPageItems;
		if(container.constructor != MasterSpread){
			container = doc;
    	allPageItems = targetLayer.allPageItems;
		} else {
			allPageItems = [];
			var thisMasterSpreadItem, thisMasterSpreadItemLayerName, targetLayerName = targetLayer.name;
		  for(var i = 0; i < container.allPageItems.length; i++){
		  	thisMasterSpreadItem = container.allPageItems[i];
		  	thisMasterSpreadItemLayerName = thisMasterSpreadItem.itemLayer.name;
		    if(thisMasterSpreadItemLayerName == targetLayerName){
		  		allPageItems.push(thisMasterSpreadItem);
		    }
		  };
		}
    var pageItemIndex = 0;  
    var pageItemsInStackingOrder = [];
    var thisItem;
    for(var n = 0; n < allPageItems.length; n++){
      thisItem = allPageItems[n];
      if(thisItem.parent.constructor.name !== "Spread" && thisItem.parent.constructor.name !== "MasterSpread"){
        continue;
      };  
      pageItemsInStackingOrder[pageItemIndex] = {
        item : thisItem,
        id : thisItem.id,
        name : thisItem.name,
        zOrder : pageItemIndex
      };
      pageItemIndex++;
    };
    return pageItemsInStackingOrder;
	},
	moveInStackingOrderRelative : function (staticItem, dynamicItem, placementOptions, container){
		/*
			designed to order items in a layer.
			staticItem, dynamicItem are custom objects:
			{
        item : pageItem,
        id : #,
        name : "",
        zOrder : # 
      }
		*/
		if(typeof container == "undefined"){
			container = doc;
		}
		var doc = app.activeDocument;
		var keyObj = [
			{ moveFuncName : "bringForward", adjacentFunc : function(index){ return index + 1; }, initialFuncName : "sendToBack" },
			{ moveFuncName : "sendBackward", adjacentFunc : function(index){ return index - 1; }, initialFuncName : "bringToFront" }
		];
		var method = keyObj[placementOptions];
		var staticDocItem = this.getAnyItemById(doc, staticItem.id);
		var dynamicDocItem = this.getAnyItemById(doc, dynamicItem.id);
		if(staticDocItem.itemLayer.id != dynamicDocItem.itemLayer.id){
			alert("Please ensure static and dynamic art is in the same layer");
			return null;
		}
		var escapeCounter = 0;
		dynamicDocItem[method.initialFuncName]();
		var orderedItems;
		var adjacentItem;
		var adjacentItemId = "", staticId = staticItem.id;

		while(escapeCounter < 1000 && adjacentItemId != staticId){
			escapeCounter++;
			orderedItems = this.getLayerItemsInOrder(container, staticDocItem.itemLayer); // TODO: make it not get the stacking order each time in loop.
			adjacentItem = orderedItems[method["adjacentFunc"](this.getByIdFromCollection(orderedItems, dynamicDocItem.id).zOrder)];
			if(typeof adjacentItem != "undefined"){
				adjacentItemId = adjacentItem.id;
			}
			// $.writeln("Adjacent Id: " + adjacentItemId + ", Static Id: " + staticId);
			if(adjacentItemId != staticId){
				dynamicDocItem[method.moveFuncName]();
			}
		}
		return true;
	},
	getLastNestedGroupByIdInCollection : function (lastNestedGroupElementObjects, id){
		var thisItem;
		for (var i = 0; i < lastNestedGroupElementObjects.length; i++) {
			thisItem = lastNestedGroupElementObjects[i];
			if(thisItem.oldId == id){
				return this.getAnyItemById(app.activeDocument, thisItem.newId);
			}
		}
		return null;
	},
	reconstructGroup : function (linearItems, relativeItem, movedItem, placementOptions, container){
		/*
			re-builds group nested structure by traversing collections and re-grouping batches of items.
			relativeItem and movedItem should be document elements
		*/

		var keyObj = [
			function(index){ return index + 1; },
			function(index){ return index - 1; }
		];
		var doc = app.activeDocument;
		var movedItemId = movedItem.id;
		var relativeItemId = relativeItem.id;

		var relativeItemObj = this.getByIdFromCollection(linearItems, relativeItemId);

		var relativeItemIndex = relativeItemObj.index;
		var movedItemIndex = keyObj[placementOptions](relativeItemIndex);
		var typename = this.getPageItemTypeName(movedItem);
		// if a group is being moved, disguise its typename property so the algorithm doesn't try to re-create this group.
		// The group is moved to its position in the stacking order via z-order operations after the target group and all its parents are ungrouped.
		if(typename == "Group"){
			typename = "_Group";
		}
		linearItems.splice(movedItemIndex, 0, {
			name : movedItem.name,
			id : movedItem.id,
			parentGroupId : relativeItemObj.parentGroupId,
			parentGroupName : relativeItemObj.parentGroupName,
			nestingLevel : relativeItemObj.nestingLevel,
			index : movedItemIndex,
			typename : typename
		});

		var sortedByNestLevel = linearItems.slice(0,).sort(function(a, b){ return a.nestingLevel < b.nestingLevel});
		var highestNestingLevel = sortedByNestLevel[0].nestingLevel;
		var nestedBatches = [], nestedBatch = [], thisItem, currentNestLevel = highestNestingLevel;
		var thisItemNestingLevel;

		for (var i = 0; i < sortedByNestLevel.length; i++) {
			thisItem = sortedByNestLevel[i];
			thisItemNestingLevel = thisItem.nestingLevel;
			if(thisItemNestingLevel == currentNestLevel){
				nestedBatch.push(thisItem);
			} else {
				nestedBatches.push(nestedBatch);
				nestedBatch = [thisItem];
				currentNestLevel--;
			}
			if(i == sortedByNestLevel.length - 1){
				nestedBatches.push(nestedBatch);
			}
		}
		
		var thisBatch, thisNestedItem, idBatches, idBatchCounter;
		var currentGroupId, currentGroupName, newGroup, idBatchGroups, foundGroupObjects = [];
		var grpName, lastNestedGroupElement, lastNestedGroupElementObjects = [], thisIdBatch;
		for (var i = 0; i < nestedBatches.length; i++) { // go through all nesting level groups
			idBatchGroups = [];
			thisBatch = nestedBatches[i];//.sort(function(a, b){return a.parentGroupId > b.parentGroupId});
			idBatches = {};
			idBatchCounter = 0;
			for (var j = 0; j < thisBatch.length; j++) { // go through elements, 
				thisNestedItem = thisBatch[j];
				if(thisNestedItem.typename == "Group"){
					foundGroupObjects.push(thisNestedItem);
					if(typeof lastNestedGroupElement == "undefined"){ // do nothing at base level
						continue;
					} else {
						// get the matching previously-created group's new ID to make this element a true existing document element
						var correspondingPreviouslyCreatedGroup = this.getLastNestedGroupByIdInCollection(lastNestedGroupElementObjects, thisNestedItem.id);
						thisNestedItem.id = correspondingPreviouslyCreatedGroup.id;
					}
				}
				if(currentGroupId != thisNestedItem.parentGroupId){ // supposed to take care of sibling groups
					currentGroupId = thisNestedItem.parentGroupId;
					currentGroupName = thisNestedItem.parentGroupName;
					if(typeof idBatches[currentGroupId] == "undefined"){
						idBatches[currentGroupId] = [];
					}
				}
				idBatches[currentGroupId].push(this.getAnyItemById(doc, thisNestedItem.id)); // idBatches has document elements now
			}

			for(var all in idBatches){ // this is where the groups get created, with each new group being recorded for their new and old ids
				idBatchCounter++;
				thisIdBatch = idBatches[all];
				newGroup = container.groups.add(thisIdBatch);
				newGroup.name = this.getByIdFromCollection(linearItems, idBatches[all][0].id).parentGroupName;
				idBatchGroups.push(newGroup);
				lastNestedGroupElement = newGroup;
				lastNestedGroupElementObjects.push({ oldId : all, newId : lastNestedGroupElement.id, name : lastNestedGroupElement.name });
			}
		}
	},
	addToGroup : function (groupItem, addedObject, relativeObject, placementOptions, container){
		/*
			Takes an item from anywhere in a layer and adds it in a specific place inside a specific group.
			relativeObject cannot be a group.
			container can be doc or masterspread
		*/
		if(typeof container == "undefined"){
			container = doc;
		}
		var doc = app.activeDocument;
		doc.selection = null; // get the needed item outside of any containing groups
		doc.select(addedObject);
		app.cut();
		app.pasteInPlace();
		addedObject = doc.selection[0];
		var originalGroupId = groupItem.id;

		var relativeObjectId = relativeObject.id, addedObjectId = addedObject.id;

		var thisLayerId = groupItem.itemLayer.id;
		var thisTopLevelGroup = this.getTopParentGroup(groupItem);
		var structure = this.recordGroupStructure(thisTopLevelGroup);
		var isItemInStructure = this.getByIdFromCollection(structure, addedObject.id) != null;
		var thisStructureItem;
		if(isItemInStructure){
			for (var i = 0; i < structure.length; i++) {
				thisStructureItem = structure[i];
				if(thisStructureItem.id == addedObject.id){
					structure.splice(i, 1);
					break;
				}
			}
		}

		this.ungroupAllInScope(thisTopLevelGroup, structure); // lay out all the nested items into the top level
		var orderedItems = this.getLayerItemsInOrder(container, app.activeDocument.layers.itemByID(thisLayerId));
		var customRelativeObj = this.getByIdFromCollection(orderedItems, relativeObjectId);
		var customAddedObj = this.getByIdFromCollection(orderedItems, addedObjectId);
		var relativeObjZOrder = customRelativeObj.zOrder;
		var addedObjZOrder = customAddedObj.zOrder;

		this.moveInStackingOrderRelative(customRelativeObj, customAddedObj, placementOptions, container);
		this.reconstructGroup(structure, relativeObject, addedObject, placementOptions, container);
		return addedObject;
	},
	addItemsToGroup : function(groupItem, addedObjects, relativeObject, placementOptions, container){
		if(addedObjects.length == 1){
			this.addToGroup(groupItem, addedObjects[0], relativeObject, placementOptions, container);
			return;
		}
		var foundItems = [], thisItem;
		var doc = app.activeDocument;
		doc.selection = null;
		for (var i = 0; i < addedObjects.length; i++) {
			thisItem = addedObjects[i];
			doc.select(thisItem);
			app.cut();
			app.pasteInPlace();
			foundItems.push(doc.selection[0]);
		}
		if(typeof container == "undefined"){
			container = doc;
		}
		var relativeObjectId = relativeObject.id;
		var containerGroup = container.groups.add(foundItems);
		var addedItemGroup = this.addToGroup(groupItem, containerGroup, this.getAnyItemById(container, relativeObjectId), placementOptions, container);
		addedItemGroup.ungroup();
		return true;
	}
};

/*
#target indesign
function test(){
	#include "GroupMover.jsx"
	var doc = app.activeDocument;
	GroupMover.addToGroup(
		GroupMover.getAnyItemByName(doc, "Sibling"),
		GroupMover.getAnyItemByName(doc, "MyGroup"),
		GroupMover.getAnyItemByName(doc, "Sibling").pageItems[0],
		// getAnyItemByName(doc, "First square in Nested"),
		GroupMover.ElementPlacement.PLACEBEFORE
	);
};
test();
*/