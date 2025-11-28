body {
    font-family: Arial, sans-serif;
    background: linear-gradient(135deg, #e9f0ff, #f7fbff);
    margin: 0;
    padding: 0;
}

.container {
    max-width: 450px;
    background: white;
    padding: 25px;
    margin: 40px auto;
    border-radius: 12px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.12);
}

.subtitle {
    color: #555;
    margin-bottom: 20px;
}

input, button {
    width: 100%;
    padding: 12px;
    margin-top: 8px;
    margin-bottom: 18px;
    font-size: 16px;
    border-radius: 8px;
    border: 1px solid #ccc;
}

button {
    background: #0077ff;
    color: white;
    font-weight: bold;
    cursor: pointer;
    border: none;
}

button:hover {
    background: #005ed1;
}

.result {
    margin-top: 20px;
    padding: 15px;
    background: #eef4ff;
    border-left: 4px solid #0077ff;
    border-radius: 6px;
}

.flag {
    width: 22px;
    height: 15px;
    margin-right: 6px;
    border-radius: 2px;
}

/* Fade animation */
.fade-in {
    animation: fadeIn 0.8s ease-in;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Mobile responsive */
@media only screen and (max-width: 500px) {
    .container {
        margin: 20px;
        padding: 20px;
    }

    h1 {
        font-size: 22px;
    }
}
