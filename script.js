const timezones = {
    "-12": ["Baker Island"],
    "-11": ["American Samoa", "Niue"],
    "-10": ["Hawaii", "Tahiti"],
    "-9": ["Alaska"],
    "-8": ["California", "British Columbia"],
    "-7": ["Colorado", "Arizona (no DST)"],
    "-6": ["Mexico City", "Chicago"],
    "-5": ["New York", "Toronto", "Lima", "Bogotá"],
    "-4": ["Caribbean", "Bolivia", "Venezuela"],
    "-3": ["Argentina", "Brazil (East)", "Uruguay"],
    "-2": ["South Georgia"],
    "-1": ["Azores"],
    "0": ["UK", "Portugal", "Ghana", "Iceland"],
    "1": ["Germany", "France", "Spain", "Italy", "Nigeria"],
    "2": ["Greece", "Egypt", "South Africa"],
    "3": ["Russia (West)", "Saudi Arabia", "Kenya"],
    "3.5": ["Iran"],
    "4": ["UAE", "Oman"],
    "4.5": ["Afghanistan"],
    "5": ["Pakistan", "Uzbekistan"],
    "5.5": ["India", "Sri Lanka"],
    "5.75": ["Nepal"],
    "6": ["Bangladesh", "Bhutan"],
    "6.5": ["Myanmar"],
    "7": ["Thailand", "Indonesia (West)"],
    "8": ["China", "Malaysia", "Singapore", "Perth"],
    "8.75": ["Australia (Eucla)"],
    "9": ["Japan", "Korea"],
    "9.5": ["Adelaide", "Darwin"],
    "10": ["Sydney", "Papua New Guinea"],
    "11": ["Solomon Islands"],
    "12": ["Fiji", "New Zealand"],
    "12.75": ["Chatham Islands"],
    "13": ["Samoa", "Tokelau"],
    "14": ["Line Islands"]
};

function calculate() {
    const bst = document.getElementById("bstTime").value;
    const local = document.getElementById("localTime").value;
    const resultDiv = document.getElementById("result");

    if (!bst || !local) {
        resultDiv.innerHTML = "⚠️ Please enter both times.";
        return;
    }

    const bstMinutes = convertToMinutes(bst);
    const localMinutes = convertToMinutes(local);

    let diff = localMinutes - bstMinutes;

    // Normalize difference into -720..+720
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;

    // Convert diff to UTC offset
    let utcOffset = 6 + diff / 60;

    // Round to nearest quarter hour
    utcOffset = Math.round(utcOffset * 4) / 4;

    const offsetString = (utcOffset >= 0 ? "+" : "") + utcOffset;

    let locations = timezones[String(utcOffset)];
    if (!locations) locations = ["No standard zone found — maybe DST or rare offset."];

    resultDiv.innerHTML = `
        <h3>🕒 Results</h3>
        <b>UTC Offset:</b> UTC${offsetString}<br><br>
        <b>Possible Locations:</b><br>
        ${locations.map(l => "• " + l).join("<br>")}
    `;
}

function convertToMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}
