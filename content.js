window.IGTracker = { trackFollowing };

function getIgAppId() {
    if (window._sharedData && window._sharedData.config) {
        return window._sharedData.config.viewerId || null;
    }
    const scripts = Array.from(document.querySelectorAll("script"));
    for (const script of scripts) {
        const text = script.textContent;
        const match = text.match(/"app_id":"(\d+)"/);
        if (match) return match[1];
    }
    return null;
}

function getUsernameTracking() {
    const url = window.location.pathname;
    const parts = url.split('/').filter(Boolean);
    const usernameFromUrl = parts[0];
    return usernameFromUrl;
}

async function fetchUserIDTracking() {
    const xIgAppId = getIgAppId();
    const usernameToTrack = getUsernameTracking();
    const url = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${usernameToTrack}`;
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "accept": "*/*",
                "x-ig-app-id": xIgAppId,
            },
            credentials: "include"
        });
        const data = await response.json();
        const profileId = data.data.user.id;
        return profileId;
    } catch (error) {
        console.error("Fetch error:", error);
        return [];
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllFollowing(maxId = 0, profileId = null) {
    const xIgAppId = getIgAppId();
    const url = `https://www.instagram.com/api/v1/friendships/${profileId}/following/?count=50&max_id=${maxId}`;
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "accept": "*/*",
                "x-ig-app-id": xIgAppId,
            },
            credentials: "include"
        });
        const data = await response.json();
        const currentUsernames = data.users.map(u => u.username);
        const nextMaxId = data.next_max_id;
        if (nextMaxId) {
            await sleep(300);
            const nextPageUsernames = await fetchAllFollowing(nextMaxId, profileId);
            return currentUsernames.concat(nextPageUsernames);
        } else {
            return currentUsernames;
        }
    } catch (error) {
        console.error("Fetch error:", error);
        return [];
    }
}

async function fetchAllFollowers(maxId = 0, profileId = null) {
    const xIgAppId = getIgAppId();
    const url = `https://www.instagram.com/api/v1/friendships/${profileId}/followers/?count=25&max_id=${maxId}`;
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "accept": "*/*",
                "x-ig-app-id": xIgAppId,
            },
            credentials: "include"
        });
        const data = await response.json();
        const currentUsernames = data.users.map(u => u.username);
        console.log("⚠️ Fetched followers page:", currentUsernames);
        const nextMaxId = data.next_max_id;
        if (nextMaxId) {
            await sleep(300);
            const nextPageUsernames = await fetchAllFollowers(nextMaxId, profileId);
            return currentUsernames.concat(nextPageUsernames);
        } else {
            return currentUsernames;
        }
    } catch (error) {
        console.error("Fetch error:", error);
        return [];
    }
}

// IndexedDB helpers
function openDB() {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open("IGTrackerDB", 2); // <-- version bumped to 2
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            // Always create both stores if missing
            if (!db.objectStoreNames.contains("following")) {
                db.createObjectStore("following");
            }
            if (!db.objectStoreNames.contains("followers")) {
                db.createObjectStore("followers");
            }
        };
        request.onsuccess = function(event) {
            resolve(event.target.result);
        };
        request.onerror = function(event) {
            reject(event.target.error);
        };
    });
}

function saveFollowingToDB(key, value) {
    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction("following", "readwrite");
            const store = tx.objectStore("following");
            const req = store.put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    });
}

function loadFollowingFromDB(key) {
    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction("following", "readonly");
            const store = tx.objectStore("following");
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    });
}

function saveFollowersToDB(key, value) {
    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction("followers", "readwrite");
            const store = tx.objectStore("followers");
            const req = store.put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    });
}

function loadFollowersFromDB(key) {
    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction("followers", "readonly");
            const store = tx.objectStore("followers");
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    });
}

async function trackFollowing() {
    const userIDToTrack =  await fetchUserIDTracking();
    if (!userIDToTrack) {
        console.error("⚠️ Không xác định được username để theo dõi.");
        return { newUsers: [], removedUsers: [] };
    }
    const dbKey = `fl_${userIDToTrack}`;
    let previousUsernames = [];
    try {
        previousUsernames = await loadFollowingFromDB(dbKey);
    } catch (err) {
        console.warn("⚠️ Lỗi đọc dữ liệu cũ từ IndexedDB:", err);
        previousUsernames = [];
    }
    let profileId;
    try {
        profileId = await fetchUserIDTracking();
    } catch (err) {
        console.error("⚠️ Không xác định được profile ID:", err);
        return { newUsers: [], removedUsers: [] };
    }
    if (!profileId) {
        console.error("⚠️ Profile ID rỗng.");
        return { newUsers: [], removedUsers: [] };
    }
    let allUsernames = [];
    try {
        allUsernames = await fetchAllFollowing(0, profileId);
    } catch (err) {
        console.error("⚠️ Lỗi fetch danh sách following:", err);
        allUsernames = [];
    }
    const previousSet = new Set(previousUsernames);
    const allSet = new Set(allUsernames);
    const newUsers = allUsernames.filter(u => !previousSet.has(u));
    const removedUsers = previousUsernames.filter(u => !allSet.has(u));
    try {
        await saveFollowingToDB(dbKey, allUsernames);
    } catch (err) {
        console.warn("⚠️ Lỗi lưu dữ liệu vào IndexedDB:", err);
    }
    return { newUsers, removedUsers };
}

async function trackFollowers() {
    const userIDToTrack = await fetchUserIDTracking();
    if (!userIDToTrack) {
        console.error("⚠️ Không xác định được username để theo dõi.");
        return { newFollowers: [], removedFollowers: [] };
    }
    const dbKey = `fw_${userIDToTrack}`;
    let previousFollowers = [];
    try {
        previousFollowers = await loadFollowersFromDB(dbKey);
        console.log("⚠️ Dữ liệu cũ từ IndexedDB:", previousFollowers);
    } catch (err) {
        console.warn("⚠️ Lỗi đọc dữ liệu cũ từ IndexedDB:", err);
        previousFollowers = [];
    }
    let profileId;
    try {
        profileId = await fetchUserIDTracking();
    } catch (err) {
        console.error("⚠️ Không xác định được profile ID:", err);
        return { newFollowers: [], removedFollowers: [] };
    }
    if (!profileId) {
        console.error("⚠️ Profile ID rỗng.");
        return { newFollowers: [], removedFollowers: [] };
    }
    let allFollowers = [];
    try {
        allFollowers = await fetchAllFollowers(0, profileId);
    } catch (err) {
        console.error("⚠️ Lỗi fetch danh sách followers:", err);
        allFollowers = [];
    }
    const previousSet = new Set(previousFollowers);
    const allSet = new Set(allFollowers);
    const newFollowers = allFollowers.filter(u => !previousSet.has(u));
    const removedFollowers = previousFollowers.filter(u => !allSet.has(u));
    try {
        await saveFollowersToDB(dbKey, allFollowers);
    } catch (err) {
        console.warn("⚠️ Lỗi lưu dữ liệu vào IndexedDB:", err);
    }
    return { newFollowers, removedFollowers };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_USERNAME") {
        const username = getUsernameTracking();
        sendResponse({ username });
    } else if (request.action === "TRACK_FOLLOWING") {
        trackFollowing().then(result => sendResponse(result));
        return true;
    } else if (request.action === "TRACK_FOLLOWERS") {
        trackFollowers().then(result => sendResponse(result));
        return true;
    }
});