document.getElementById("workshop-btn").addEventListener(
    "click", workshopInfoHandler
);

document.getElementById("workshop-action-select").addEventListener(
    "change", enableFields
)

document.getElementById("workshop-suspension-btn").addEventListener(
    "click", workshopSuspensionInfoHandler
);

document.getElementById("workshop-suspension-action-select").addEventListener(
    "change", enableSuspensionFields
)

enableFields();
enableSuspensionFields();

function enableFields() {
    const allElems = [
        "workshop-action-select",
        "workshop-info-select",
        "workshop-student-id",
        "workshop-talk-id",
        "workshop-new-value"
    ]
    let disabledElemList = [];
    switch (document.getElementById("workshop-action-select").value) {
        case "fetch":
        case "reload":
            disabledElemList.push("workshop-student-id");
            disabledElemList.push("workshop-new-value");
            break
        case "change":
            break
        case "flush":
        default:
            disabledElemList.push("workshop-info-select");
            disabledElemList.push("workshop-student-id");
            disabledElemList.push("workshop-talk-id");
            disabledElemList.push("workshop-new-value");
    }

    for (let id of allElems) {
        if (disabledElemList.includes(id)) {
            const elemToDisable = document.getElementById(id);
            elemToDisable.value = "";
            elemToDisable.disabled = true;
        } else {
            const elemToEnable = document.getElementById(id);
            elemToEnable.disabled = false;
        }
    }
}

function workshopInfoHandler(e) {
    e.preventDefault(); // We will handle submit

    let postBody;
    switch (document.getElementById("workshop-action-select").value) {
        case "fetch":
        // fetch the specified file
        case "reload":
            // request the server to read the specified file from the disk
            postBody = {
                action: document.getElementById("workshop-action-select").value,
                information_name: document.getElementById("workshop-info-select").value,
                talk_id: document.getElementById("workshop-talk-id").value,
            }
            break
        case "change":
            postBody = {
                action: document.getElementById("workshop-action-select").value,
                student_id: document.getElementById("workshop-student-id").value,
                talk_id: document.getElementById("workshop-talk-id").value,
                new_value: document.getElementById("workshop-new-value").value,
            }
            break
        case "flush":
        default:
            postBody = {
                action: document.getElementById("workshop-action-select").value,
            }
    }
    console.log(postBody)

    // (B) AJAX FETCH CSV FILE
    fetch("/internal/update", {
        method: "POST",
        body: JSON.stringify(postBody)
    }).then(res => res.json())
        .then(data => {
            document.getElementById("workshop-message").innerText = data.message;
            formatTable("workshop-info", data.data);
        }).catch((err => {
        document.getElementById("workshop-message").innerText = err;
        formatTable("workshop-info", "");
    }));
}

/**
 * Suspension information.
 */
function enableSuspensionFields() {
    const allElems = [
        "workshop-suspension-action-select",
        "workshop-suspension-first-name",
        "workshop-suspension-last-name",
        "workshop-suspension-new-value"
    ]
    let disabledElemList = [];
    switch (document.getElementById("workshop-suspension-action-select").value) {
        case "fetch":
            disabledElemList.push("workshop-suspension-first-name");
            disabledElemList.push("workshop-suspension-last-name");
            disabledElemList.push("workshop-suspension-new-value");
            break
        case "add":
            disabledElemList.push("workshop-new-value");
            break
        case "suspend":
        default:
            disabledElemList.push("workshop-suspension-first-name");
            disabledElemList.push("workshop-suspension-last-name");
    }

    for (let id of allElems) {
        if (disabledElemList.includes(id)) {
            const elemToDisable = document.getElementById(id);
            elemToDisable.value = "";
            elemToDisable.disabled = true;
        } else {
            const elemToEnable = document.getElementById(id);
            elemToEnable.disabled = false;
        }
    }
}


function workshopSuspensionInfoHandler(e) {
    e.preventDefault(); // We will handle submit

    let postBody;
    switch (document.getElementById("workshop-suspension-action-select").value) {
        case "fetch":
            // fetch the suspension information
            postBody = {
                verb: document.getElementById("workshop-suspension-action-select").value,
            }
            break
        case "add":
            // request the server to read the specified file from the disk
            postBody = {
                verb: document.getElementById("workshop-suspension-action-select").value,
                firstname: document.getElementById("workshop-suspension-first-name").value.toLowerCase().trim(),
                lastname: document.getElementById("workshop-suspension-last-name").value.toLowerCase().trim(),
            }
            break
        case "suspend":
            postBody = {
                verb: document.getElementById("workshop-suspension-action-select").value,
                suspended: document.getElementById("workshop-suspension-new-value").value === "true",
            }
            break
        default:
            postBody = {
                verb: document.getElementById("workshop-suspension-action-select").value === "true",
            }
    }
    console.log(postBody)

    // (B) AJAX FETCH CSV FILE
    fetch("/admin/suspension", {
        method: "POST",
        body: JSON.stringify(postBody)
    }).then(res => res.json())
        .then(data => {
            document.getElementById("workshop-message").innerText = data.message;
            if (data.data) {
                let table = "First Name,Last Name\n";
                for (let name of data.data.whitelist) {
                    table += `${name.replace(" ", ",")}\n`
                }
                formatTable("workshop-info", table);
            }
        }).catch((err => {
        document.getElementById("workshop-message").innerText = err;
        formatTable("workshop-info", "");
    }));
}


function formatTable(table_id, table_csv) {
    let table = document.getElementById(table_id);

    // (B1) REMOVE OLD TABLE ROWS
    table.innerHTML = "";

    if (table_csv) {
        // (B2) GENERATE TABLE
        table_csv = table_csv.split("\n");
        for (let row of table_csv) {
            let tr = table.insertRow();
            for (let col of row.split(",")) {
                let td = tr.insertCell();
                td.innerHTML = col;
            }
        }
    }
}

