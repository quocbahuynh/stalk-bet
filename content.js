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



async function trackFollowing() {
    const userIDToTrack =  await fetchUserIDTracking();
    if (!userIDToTrack) {
        console.error("⚠️ Không xác định được username để theo dõi.");
        return { newUsers: [], removedUsers: [] };
    }
    const localStorageSaveKey = `fl_${userIDToTrack}`;
    let previousUsernames = [];
    try {
        previousUsernames = JSON.parse(localStorage.getItem(localStorageSaveKey) || "[]");
    } catch (err) {
        console.warn("⚠️ Lỗi đọc dữ liệu cũ:", err);
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
        localStorage.setItem(localStorageSaveKey, JSON.stringify(allUsernames));
    } catch (err) {
        console.warn("⚠️ Lỗi lưu dữ liệu vào localStorage:", err);
    }
    return { newUsers, removedUsers };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_USERNAME") {
        const username = getUsernameTracking();
        sendResponse({ username });
    } else if (request.action === "TRACK_FOLLOWING") {
        trackFollowing().then(result => sendResponse(result));
        return true;
    }
});