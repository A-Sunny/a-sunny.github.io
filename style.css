// Flags sourced from public CDN
function flag(countryCode) {
    return `<img src="https://flagcdn.com/w20/${countryCode}.png" class="flag">`;
}

// Timezones with country codes for flags
const timezones = {
    "-5": [
        {name: "USA (New York)", code: "us"},
        {name: "Canada (Toronto)", code: "ca"},
        {name: "Peru (Lima)", code: "pe"},
        {name: "Colombia (Bogotá)", code: "co"}
    ],
    "-4": [
        {name: "USA (DST mode)", code: "us"},
        {name: "Caribbean", code: "jm"},
        {name: "Bolivia", code: "bo"}
    ],
    "0": [
        {name: "UK", code: "gb"},
        {name: "Portugal", code: "pt"},
        {name: "Ghana", code: "gh"},
        {name: "Iceland", code: "is"}
    ],
    "1": [
        {name: "Germany", code: "de"},
        {name: "France", code: "fr"},
        {name: "Spain", code: "es"},
        {name: "Italy", code: "it"},
        {name: "Nigeria", code: "ng"}
    ],
    "6": [
        {name: "Bangladesh", code: "bd"},
        {name: "Bhutan", code: "bt"}
    ],
    "9": [
        {name: "Japan", code: "jp"},
        {name: "South Korea", code: "kr"}
    ],
    "10": [
        {name: "Australia (Sydney)", code: "au"}
    ]
};

function calculate() {
    const bst = document.getElementById("bstTime").value;
    const local = document.getElementById("localTime").value;
    const output = document.getElementById("result");

    if (!bst || !local) {
        output.innerHTML = "⚠️ Please enter both times.";
        return;
    }

    const bstMin = toMinutes(bst);
    const localMin = toMinutes(local);

    let diff = localMin - bstMin;

    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;

    let utcOffset = 6 + diff / 60;

    const rawOffset = utcOffset;
    const dstOffset = utcOffset + 1;

    const rounded = Math.round(rawOffset * 4) / 4;
    const roundedDst = Math.round(dstOffset * 4) / 4;

    output.innerHTML = `
        <h3>🕒 Results</h3>

        <b>Standard Time (No DST):</b><br>
        UTC${format(rounded)}<br>
        ${showLocations(rounded)}

        <br><br>

        <b>Possible DST Time:</b><br>
        UTC${format(roundedDst)}<br>
        ${showLocations(roundedDst)}
    `;
}

function toMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function format(n) {
    return (n >= 0 ? "+" : "") + n;
}

function showLocations(offset) {
    const zone = timezones[String(offset)];
    if (!zone) return "<i>No matching standard timezone found.</i>";

    return zone.map(z => `${flag(z.code)} ${z.name}`).join("<br>");
}
