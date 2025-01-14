/* -*- js-indent-level: 8; fill-column: 100 -*- */
/*
 * L.Control.Zotero
 */

/* global _ */
L.Control.Zotero = L.Control.extend({

	onAdd: function (map) {
		this.map = map;
		this.enable = false;
		this.map.on('updateviewslist', this.onUpdateViews, this);
	},

	onRemove: function () {
		this.map.off('updateviewslist', this.onUpdateViews, this);
	},

	onUpdateViews: function () {
		var userExtraInfo = this.map._docLayer ? this.map._viewInfo[this.map._docLayer._viewId].userextrainfo : null;
		if (userExtraInfo) {
			this.apiKey = userExtraInfo.ZoteroAPIKey;
			if (this.apiKey)
				this.updateUserID();
		}
	},

	updateUserID: function () {
		var that = this;
		fetch('https://api.zotero.org/keys/' + this.apiKey)
			.then(function (response) { return response.json(); })
			.then(function (data) {
				that.userID = data.userID;
				that.enable = !!that.userID;
				if (that.map.uiManager.notebookbar)
					that.map.uiManager.refreshNotebookbar();
				else
					that.map.uiManager.refreshMenubar();
			});
	},

	dialogSetup: function (title, showCategories) {
		this.remove();

		var data = {
			id: 'ZoteroDialog',
			dialogid: 'ZoteroDialog',
			type: 'dialog',
			text: title,
			title: title,
			jsontype: 'dialog',
			responses: [
				{
					id: 'ok',
					response: 1
				},
				{
					id: 'cancel',
					response: 0
				},
			],
			children: [
				{
					id: 'ZoteroDialog-mainbox',
					type: 'container',
					vertical: true,
					children: [
						{
							id: 'ZoteroDialog-search-container',
							type: 'container',
							layoutstyle: 'end',
							children: [
								{
									type: 'fixedtext',
									id: 'zoterosearch-label',
									text: _('Search:')
								},
								{
									type: 'edit',
									id: 'zoterosearch',
									text: ''
								}
							]
						},
						{
							id: 'ZoteroDialog-content',
							type: 'container',
							children: [
								(showCategories) ? {
									type: 'treelistbox',
									id: 'zoterocategory',
									enabled: false,
									entries: this.getDefaultCategories()
								} : {},
								{
									type: 'treelistbox',
									id: 'zoterolist',
									enabled: false,
								}
							]
						},
						{
							id: 'ZoteroDialog-buttonbox',
							type: 'buttonbox',
							children: [
								{
									id: 'cancel',
									type: 'pushbutton',
									text: '~Cancel',
								},
								{
									id: 'ok',
									type: 'pushbutton',
									text: '~Ok',
									'has_default': true,
								}
							],
							vertical: false,
							layoutstyle: 'end'
						}
					]
				},
			],
		};

		this.items = []; // zoterolist content
		this.categories = this.getDefaultCategories(); // zoterocategory content

		this.groups = [];
		this.collections = [];

		var dialogBuildEvent = {
			data: data,
			callback: this._onAction.bind(this),
		};


		this.map.fire(window.mode.isMobile() ? 'mobilewizard' : 'jsdialog', dialogBuildEvent);

		return this;
	},

	updateList: function(headerArray, failText) {
		if (this.items.length !== 0) {
			return {
				data: {
					jsontype: 'dialog',
					action: 'update',
					id: 'ZoteroDialog',
					control: {
						id: 'zoterolist',
						type: 'treelistbox',
						headers: headerArray.map(
							function(item) { return { text: item }; }
						),
						entries: this.items,
					},
				},
				callback: this._onAction.bind(this)
			};
		} else {
			return {
				data: {
					jsontype: 'dialog',
					action: 'update',
					id: 'ZoteroDialog',
					control: {
						id: 'zoterolist',
						type: 'treelistbox',
						entries: [ { text: failText } ]
					},
				},
			};
		}
	},

	getDefaultCategories: function () {
		return [
			{ columns: [{ text: _('My Library'), row: 'https://api.zotero.org/users/' + this.userID + '/items/top?v=3&key=' + this.apiKey + '&include=data,citation,bib'} ] },
			{ columns: [{ text: _('Group Libraries')}] }];
	},

	updateCategories: function() {
		return {
			data: {
				jsontype: 'dialog',
				action: 'update',
				id: 'ZoteroDialog',
				control: {
					id: 'zoterocategory',
					type: 'treelistbox',
					entries: this.categories,
				},
			},
			callback: this._onAction.bind(this)
		};
	},

	getCitationJSONString: function(item) {
		var resultJSON = {};
		resultJSON['citationID'] = Math.random().toString(36).substring(2,12);

		resultJSON['schema'] = 'https://raw.githubusercontent.com/citation-style-language/schema/master/schemas/input/csl-citation.json';

		var properties = {
			formattedCitation: item['citation'],
			plainCitation: new DOMParser().parseFromString(item['citation'], 'text/html').documentElement.textContent,
			noteIndex: '0'
		};

		resultJSON['properties'] = properties;

		var citationItems = {
			id: item['csljson'].id,
			uris: [item['links']['self']['href'], item['links']['alternate']['href']],
		};

		citationItems['itemData'] = item['csljson'];

		resultJSON['citationItems'] = [citationItems];

		return JSON.stringify(resultJSON);
	},

	fillCategories: function () {
		this.categories = this.getDefaultCategories().slice();
		this.categories[0].children = this.collections.slice();
		this.categories[1].children = this.groups.slice();
	},

	// columns: Array of details which will be displayed in the dialog
	// entryData: Object containing extra details related to the entry
	createEntry: function (index, columns, entryData, hasIcon) {
		if (hasIcon) {
			var icon = 'zotero' + entryData.itemType;
			var firstColumn = [ { collapsed: icon, expanded: icon } ];
		} else {
			firstColumn = [];
		}
		this.items.push(Object.assign({ 'columns': firstColumn.concat(columns.map(
			function (item) {
				return { text: item };
			}
		)), row: index,
		}, entryData));
	},

	fillItems: function (items) {
		for (var iterator = 0; iterator < items.length; ++iterator) {
			if (items[iterator].data.itemType === 'note')
				continue;

			var creatorArray = [];
			for (var creator = 0; items[iterator].data.creators && creator < items[iterator].data.creators.length; ++creator) {
				creatorArray.push(items[iterator].data.creators[creator].firstName + ' ' + items[iterator].data.creators[creator].lastName);
			}
			var creatorString = creatorArray.join(', ');
			this.createEntry(iterator,
				[items[iterator].data.title, creatorString, items[iterator].data.date],
				{type: 'item', itemType: items[iterator].data.itemType, item: items[iterator]}
			);
		}
	},

	fillStyles: function (styles) {
		for (var iterator = 0; iterator < styles.length; ++iterator) {
			this.createEntry(iterator, [styles[iterator].title], {name: styles[iterator].name, type: 'style'});
		}
	},

	showItemList: function () {
		var that = this;

		that.dialogSetup(_('My Library'), true);
		var dialogUpdateEvent = that.updateList(['Title', 'Creator(s)', 'Date'], _('Loading'));
		that.map.fire('jsdialogupdate', dialogUpdateEvent);
		that.map.fire('jsdialogupdate', that.updateCategories());

		fetch('https://api.zotero.org/users/' + this.userID + '/items/top?v=3&key=' + this.apiKey + '&include=data,citation,bib,csljson')
			.then(function (response) { return response.json();})
			.then(function (data) {
				that.fillItems(data);

				var dialogUpdateEvent = that.updateList(['Title', 'Creator(s)', 'Date'], _('Your library is empty'));

				if (window.mode.isMobile()) window.mobileDialogId = dialogUpdateEvent.data.id;
				that.map.fire('jsdialogupdate', dialogUpdateEvent);
			});

		fetch('https://api.zotero.org/users/' + this.userID + '/groups?v=3&key=' + this.apiKey)
			.then(function (response) { return response.json(); })
			.then(function (data) {
				for (var i = 0; i < data.length; i++) {
					that.groups.push(
						{
							columns: [ { text: data[i].data.name } ],
							id: data[i].data.id,
							row: data[i].links.self.href + '/items/top?v=3&key=' + that.apiKey
						});
					that.fillCategories();
					that.map.fire('jsdialogupdate', that.updateCategories());
				}
			});

		fetch('https://api.zotero.org/users/' + this.userID + '/collections?v=3&key=' + this.apiKey)
			.then(function (response) { return response.json(); })
			.then(function (data) {
				for (var i = 0; i < data.length; i++) {
					that.collections.push(
						{
							columns: [ { text: data[i].data.name } ],
							id: data[i].data.key,
							row: data[i].links.self.href + '/items/top?v=3&key=' + that.apiKey
						});
					that.fillCategories();
					that.map.fire('jsdialogupdate', that.updateCategories());
				}
			});
	},

	showStyleList: function() {
		var that = this;
		fetch('https://www.zotero.org/styles-files/styles.json')
			.then(function (response) { return response.json();})
			.then(function (data) {
				that.dialogSetup(_('Citation Style'), false);
				that.fillStyles(data);

				var dialogUpdateEvent = that.updateList(['Styles'],_('An error occurred while fetching style list'));

				if (window.mode.isMobile()) window.mobileDialogId = dialogUpdateEvent.data.id;
				that.map.fire('jsdialogupdate', dialogUpdateEvent);
			});
	},

	_onAction: function(element, action, data, index) {
		var that = this;
		if (element === 'dialog' && action === 'close') return;
		if (element === 'treeview') {
			if (data.id === 'zoterocategory') {
				var url = index;
				if (!url)
					return;
				that.items = [];
				fetch(url)
					.then(function (response) { return response.json();})
					.then(function (data) {
						that.fillItems(data);
						var dialogUpdateEvent = that.updateList(['Title', 'Creator(s)', 'Date'], _('Your library is empty'));
						that.map.fire('jsdialogupdate', dialogUpdateEvent);
					});
				return;
			} else {
				this.selected = data.entries[parseInt(index)];
				return;
			}
		}
		if (element === 'edit' && data.id === 'zoterosearch') {
			document.getElementById('zoterolist').filterEntries(data.value);
			return;
		}
		if (element === 'responsebutton' && data.id == 'ok' && this.selected) {
			this._onOk(this.selected);
		}

		var closeEvent = {
			data: {
				action: 'close',
				id: 'ZoteroDialog',
			}
		};
		this.map.fire(window.mode.isMobile() ? 'closemobilewizard' : 'jsdialog', closeEvent);
		console.log('Closed after');
	},

	_onOk: function (selected) {
		console.log(selected);


		if (selected.type === 'item') {
			var parameters = {
				FieldType: {type: 'string', value: 'vnd.oasis.opendocument.field.UNHANDLED'},
				FieldCommand: {type: 'string', value: 'ADDIN ZOTERO_ITEM CSL_CITATION ' + this.getCitationJSONString(selected.item)},
				FieldResult: {type: 'string', value: selected.item.citation}
			};
			this.map.sendUnoCommand('.uno:TextFormField', parameters);
		}
		else if (selected.type === 'style') {
			console.log('do something');
		}
	},

	handleItemList: function() {
		this.showItemList();
	},

	handleStyleList: function() {
		this.showStyleList();
	},

	_onMessage: function(message) {
		if (message.startsWith('itemslist: ')) {
			this.handleItemList(message);
		}
	}
});

L.control.zotero = function (map) {
	return new L.Control.Zotero(map);
};

