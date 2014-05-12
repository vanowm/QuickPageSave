const {classes: Cc, interfaces: Ci, utils: Cu} = Components,
			PREF_BRANCH = "extensions.quickpagesave.",
			PREF_SAVEDIR = "saveDir";

Cu.import("resource://gre/modules/Services.jsm");
let pref = Services.prefs.getBranch(PREF_BRANCH),
		prefDefault = Services.prefs.getDefaultBranch(PREF_BRANCH);

function startup(data, reason)
{
	// just in case remove existing setting if it doesn't match string type
	if (prefDefault.getPrefType(PREF_SAVEDIR) != Ci.nsIPrefBranch.PREF_STRING)
		prefDefault.deleteBranch(PREF_SAVEDIR);

	// creating default settings
	prefDefault.setCharPref(PREF_SAVEDIR, "");

	watchWindows(function(window, type)
	{
		if (!("saveDocument" in window))
			return;

		// backup existing saveDocument function
		let _saveDocument = window.saveDocument;
		unload(function()
		{
			window.saveDocument = _saveDocument;
		});
		// overwrite original function with ours
		window.saveDocument = function saveDocument(doc, skip)
		{
			if (typeof(skip) != "undefined")
			{
				_saveDocument(doc, skip);
				return;
			}
			let saveDir = pref.getComplexValue(PREF_SAVEDIR, Ci.nsISupportsString),
					// backup current settings
					_pref = Services.prefs.getBranch("browser.download."),
					_useDownloadDir = _pref.getBoolPref("useDownloadDir"),
					_folderList = _pref.getIntPref("folderList"),
					_dir;
			try {_dir = _pref.getComplexValue("dir", Ci.nsISupportsString)}catch(e){}
			// set browser.download.dir to our predefined directory
			_pref.setComplexValue("dir", Ci.nsISupportsString, saveDir);
			// folderList must be set to 2 (custom), otherwise browser.download.dir will be ignored
			_pref.setIntPref("folderList", 2);
			// disable "Save as" prompt
			_pref.setBoolPref("useDownloadDir", true);

			_saveDocument(doc, true);

			// restore original settings
			_pref.setIntPref("folderList", _folderList);
			_pref.setBoolPref("useDownloadDir", _useDownloadDir);
			if (typeof(_dir) == "undefined")
				_pref.deleteBranch("dir");
			else
				_pref.setComplexValue("dir", Ci.nsISupportsString, _dir);

		} //saveDocument()
	}) //watchWindows()
} //startup()

function shutdown(data, reason)
{
	unload();
}

function install(data, reason)
{
}

function uninstall(data, reason)
{
	if (reason == ADDON_UNINSTALL)
	{
		pref.deleteBranch('');
		prefDefault.deleteBranch('');
	}
}





/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Home Dash Utility.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
 *   Erik Vold <erikvvold@gmail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Save callbacks to run when unloading. Optionally scope the callback to a
 * container, e.g., window. Provide a way to run all the callbacks.
 *
 * @usage unload(): Run all callbacks and release them.
 *
 * @usage unload(callback): Add a callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 *
 * @usage unload(callback, container) Add a scoped callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @param [node] container: Remove the callback when this container unloads.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 */
function unload(callback, container) {
	// Initialize the array of unloaders on the first usage
	let unloaders = unload.unloaders;
	if (unloaders == null)
		unloaders = unload.unloaders = [];

	// Calling with no arguments runs all the unloader callbacks
	if (callback == null) {
		unloaders.slice().forEach(function(unloader) unloader());
		unloaders.length = 0;
		return true;
	}

	// The callback is bound to the lifetime of the container if we have one
	if (container != null) {
		// Remove the unloader when the container unloads
		container.addEventListener("unload", removeUnloader, false);

		// Wrap the callback to additionally remove the unload listener
		let origCallback = callback;
		callback = function() {
			container.removeEventListener("unload", removeUnloader, false);
			origCallback();
		}
	}

	// Wrap the callback in a function that ignores failures
	function unloader() {
		try {
			callback();
		}
		catch(ex) {}
	}
	unloaders.push(unloader);

	// Provide a way to remove the unloader
	function removeUnloader() {
		let index = unloaders.indexOf(unloader);
		if (index != -1)
			unloaders.splice(index, 1);
		return true;
	}
	return removeUnloader;
}

/**
 * Apply a callback to each open and new browser windows.
 *
 * @usage watchWindows(callback): Apply a callback to each browser window.
 * @param [function] callback: 1-parameter function that gets a browser window.
 */
function watchWindows(callback, type, onload) {
	var unloaded = false;
	type = type || null;
	onload = typeof(onload) == "undefined" ? true : onload;
	unload(function() unloaded = true);

	// Wrap the callback in a function that ignores failures
	function watcher(window, _type) {
		try {
			if (!type || type == window.document.documentElement.getAttribute("windowtype"))
				callback(window, _type);
		}
		catch(ex) {}
	}

	// Wait for the window to finish loading before running the callback
	function runOnLoad(window) {
		// Listen for one load event before checking the window type
		window.addEventListener("load", function runOnce() {
			window.removeEventListener("load", runOnce, false);
			if (unloaded) return; // the extension has shutdown
			watcher(window, "load");
		}, false);
	}

	// Add functionality to existing windows
	let windows = Services.wm.getEnumerator(type);
	while (windows.hasMoreElements()) {
		// Only run the watcher immediately if the window is completely loaded
		let window = windows.getNext();
		if (window.document.readyState == "complete" || !onload)
			watcher(window);
		// Wait for the window to load before continuing
		else
			runOnLoad(window);
	}

	// Watch for new browser windows opening then wait for it to load
	function windowWatcher(subject, topic) {
		if (topic == "domwindowopened")
			if (onload)
				runOnLoad(subject);
			else
				watcher(subject);
	}
	Services.ww.registerNotification(windowWatcher);

	// Make sure to stop watching for windows if we're unloading
	unload(function() Services.ww.unregisterNotification(windowWatcher));
}