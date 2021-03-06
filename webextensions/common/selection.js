/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

import * as Constants from './constants.js';
import * as Permissions from './permissions.js';

import EventListenerManager from '../extlib/EventListenerManager.js';
import TabIdFixer from '../extlib/TabIdFixer.js';

export default class Selection {
  constructor(windowId) {
    this.mTabs = {};
    this.mTargetWindow = windowId;
    this.mLastClickedTab = null;

    this.onChange = new EventListenerManager();
  }

  serialize() {
    return {
      tabs: this.mTabs,
      targetWindow: this.mTargetWindow,
      lastClickedTab: this.mLastClickedTab
    };
  }

  apply(foreignSelection) {
    if ('tabs' in foreignSelection)
      this.mTabs = foreignSelection.tabs;
    if ('targetWindow' in foreignSelection)
      this.mTargetWindow = foreignSelection.targetWindow;
    if ('lastClickedTab' in foreignSelection)
      this.mLastClickedTab = foreignSelection.lastClickedTab;
  }

  set(tabs, selected, options = {}) {
    if (!Array.isArray(tabs))
      tabs = [tabs];

    const shouldHighlight = options.globalHighlight !== false;

    //console.log('setSelection ', ids, `${aState}=${selected}`);
    if (selected) {
      for (const tab of tabs) {
        if (tab.id in this.mTabs)
          continue;
        this.mTabs[tab.id] = tab;
        if (shouldHighlight &&
            Permissions.isPermittedTab(tab) &&
            !tab.pinned)
          Permissions.isGranted(Permissions.ALL_URLS).then(() => {
            browser.tabs.executeScript(tab.id, {
              code: `document.title = '✔' + document.title;`
            });
          });
      }
    }
    else {
      for (const tab of tabs) {
        if (!(tab.id in this.mTabs))
          continue;
        delete this.mTabs[tab.id];
        if (shouldHighlight &&
            Permissions.isPermittedTab(tab) &&
            !tab.pinned)
          Permissions.isGranted(Permissions.ALL_URLS).then(() => {
            browser.tabs.executeScript(tab.id, {
              code: `document.title = document.title.replace(/^✔/, '');`
            });
          });
      }
    }
    browser.runtime.sendMessage(Constants.kTST_ID, {
      type:  selected ? Constants.kTSTAPI_ADD_TAB_STATE : Constants.kTSTAPI_REMOVE_TAB_STATE,
      tabs:  tabs.map(tab => tab.id),
      state: options.states || options.state || 'selected'
    }).catch(_e => {}); // TST is not available
    this.onChange.dispatch(tabs, selected, options);
  }

  async setAll(selected = true) {
    const tabs = await this.getAllTabs();
    this.set(tabs, selected);
  }

  contains(tabOrTabId) {
    const id = TabIdFixer.fixTabId(typeof tabOrTabId == 'number' ? tabOrTabId : tabOrTabId.id);
    return id in this.mTabs;
  }

  has() {
    return this.count() > 0;
  }

  count() {
    return Object.keys(this.mTabs).length;
  }

  async getAllTabs() {
    const tabs = await browser.tabs.query({ windowId: this.mTargetWindow });
    return tabs.map(TabIdFixer.fixTab);
  }

  async getAPITabSelection(params = {}) {
    const ids        = params.selectedIds || this.getSelectedTabIds();
    const selected   = [];
    const unselected = [];
    const tabs       = params.allTabs || await this.getAllTabs();
    for (const tab of tabs) {
      if (ids.indexOf(tab.id) < 0)
        unselected.push(tab);
      else
        selected.push(tab);
    }
    return { selected, unselected };
  }

  getSelectedTabs() {
    return Object.values(this.mTabs);
  }

  getSelectedTabIds() {
    return Object.keys(this.mTabs).map(id => parseInt(id));
  }

  setLastClickedTab(tab) {
    return this.mLastClickedTab = tab;
  }

  getLastClickedTab() {
    return this.mLastClickedTab;
  }

  async invert() {
    const tabs = await this.getAllTabs();
    const selectedIds = this.getSelectedTabIds();
    const newSelected = [];
    const oldSelected = [];
    for (const tab of tabs) {
      const toBeSelected = selectedIds.indexOf(tab.id) < 0;
      if (toBeSelected)
        newSelected.push(tab);
      else
        oldSelected.push(tab);
    }
    this.set(oldSelected, false);
    this.set(newSelected, true);
  }

  clear(options = {}) {
    const tabs = [];
    for (const id of Object.keys(this.mTabs)) {
      tabs.push(this.mTabs[id]);
    }
    this.set(tabs, false, options);
    this.mTabs = {};
    this.mLastClickedTab = null;
  }

}
