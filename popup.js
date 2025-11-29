const output = document.getElementById("output");

async function sendMessageToActiveTab(message) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
            resolve(response);
        });
    });
}

document.getElementById("trackFollowingBtn").addEventListener("click", async () => {
    output.textContent = "Checking changes...";
    const result = await sendMessageToActiveTab({ action: "TRACK_FOLLOWING" });
    if (!result || (!result.newUsers && !result.removedUsers)) {
        output.textContent = "Cannot detect user, not on profile page, or content script not loaded!";
        return;
    }
    output.innerHTML = `<b>Check result:</b><br>
        New Users: ${(result.newUsers || []).join(", ")}<br>
        Removed Users: ${(result.removedUsers || []).join(", ")}`;
});

document.getElementById("trackFollowerBtn").addEventListener("click", async () => {
    output.textContent = "Checking changes...";
    const result = await sendMessageToActiveTab({ action: "TRACK_FOLLOWERS" });
    if (!result || (!result.newFollowers && !result.removedFollowers)) {
        output.textContent = "Cannot detect user, not on profile page, or content script not loaded!";
        return;
    }
    output.innerHTML = `<b>Check result:</b><br>
        New Followers: ${(result.newFollowers || []).join(", ")}<br>
        Removed Followers: ${(result.removedFollowers || []).join(", ")}`;
});

document.addEventListener("DOMContentLoaded", async () => {
    const usernameDisplay = document.getElementById("usernameDisplay");
    const response = await sendMessageToActiveTab({ action: "GET_USERNAME" });
    usernameDisplay.textContent = response?.username
        ? `Username: ${response.username}`
        : "Username: Unknown";
});
