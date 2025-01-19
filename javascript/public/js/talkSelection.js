const newBadge = `<span class="badge bg-secondary">New</span>`;
const enforcingViewOrder = true;
const enforcingSubjectQuestionnaire = true;
let oneTalkOnly = false;

/**
 * Main function. Create cards of information dynamically.
 */
window.onload = async function () {
    // format navigation bar
    const welcomeDiv = document.getElementById("welcome");
    if (userInfo.name.includes(".com") || userInfo.name.includes(".edu")) {
        // using emails
        welcomeDiv.innerText = "Welcome, " + userInfo.name.replace(" ", "@") + "!";
    } else {
        // using real names
        welcomeDiv.innerText = "Welcome, " + titleCase(userInfo.name) + "!";
    }

    // fetch user profile
    let userProfile = await fetchUserProfile();

    // fetch consent forms
    fetchDocuSignLinks()
        .then(
            // display consent form information
            (linkInfo) => {
                userProfile.adminConfirmed = linkInfo.adminConfirmed;
                formatDocuSignLinks(linkInfo.links, userProfile)
            }
        ).then(() => fetchTalks()) // fetch talk information
        .then(talks => {
            oneTalkOnly = talks.length === 1;
            formatTalks(talks, userProfile)
        }) // display all talks as cards
        .then(() => fetchSubjectiveQuestionnaireLinks()) // fetch subjective questionnaire information
        .then(questionnaires => formatSubjectiveQuestionnaire(questionnaires, userProfile)) // display quationnaires
        .catch(e => {
            console.error(e);
            showAlert(lectureFail, 'warning');
            formatTalkInfo(errorLectureInfo);
        })
}

async function fetchUserProfile() {
    const response = await fetch("/workshop/progress", {
        method: 'POST',
        body: JSON.stringify({
            checkpoint: "all_progress",
            userInfo: userInfo,
        })
    })
    return response.json()
}

function fetchTalks() {
    return fetch("/admin/talks").then(
        res => res.json()
    )
}

function fetchDocuSignLinks() {
    return fetch("/admin/consent-forms").then(
        res => res.json()
    )
}

function fetchSubjectiveQuestionnaireLinks() {
    return fetch("/admin/questionnaire").then(
        res => res.json()
    )
}

function formatDocuSignLinks(links, userProfile) {
    const ul = document.getElementById("docusign-card-links");

    links.forEach((link, index) => {
        const li = document.createElement("li"),
            formName = document.createElement("span");
        let btn = document.createElement("a");

        li.classList.add("list-group-item", "d-flex", "justify-content-between", "align-items-start");
        formName.innerHTML = formNameToDescription(link.formName);

        if (userProfile.confirmed && userProfile.adminConfirmed) {
            btn = document.createElement("span");
            btn.classList.add("badge", "bg-secondary");
            btn.innerText = "Completed";
        } else if (userProfile.confirmed && !userProfile.adminConfirmed) {
            btn.classList.add("btn", "btn-sm", "btn-outline-secondary")
            btn.innerText = "Sign Again";
            btn.href = link.formLink;
            btn.target = "_blank";
        } else {
            btn.classList.add("btn", "btn-sm", "btn-outline-primary")
            btn.innerText = "eSign";
            btn.href = link.formLink;
            btn.target = "_blank";
        }

        li.append(formName, btn);
        ul.append(li);
    })

    if (userProfile.confirmed) {
        // remove the part for self report
        document.getElementById("confirm-doc-card-body").remove();
        if (!userProfile.adminConfirmed) {
            document.getElementById("docusign-card-text-1").innerText = "Administrators are confirming the form. This usually takes around 5 minutes.";
        }
    } else {
        // further add a place for user to self report all forms are signed
        document.getElementById("confirm-doc-btn").addEventListener("click", onsubmit)
    }
}

function formatTalks(talkInfo, userProfile) {
    if (talkInfo === null) throw new Error('No registered or legal talk info.');
    const row = document.getElementById("card-row");

    let {enableStart, enableReview} = checkWatchReviewConditions(userProfile, oneTalkOnly);

    if (oneTalkOnly) {
        /** the talk id must not be 0 to make everything work normally. */
        row.append(createCard(talkInfo[0], userProfile[`talk_1`], enableStart, enableReview))
    } else {
        talkInfo.forEach(
            (talk, i) => {
                row.append(createCard(talk, userProfile[`talk_${i}`], enableStart[i], enableReview[i]))
            }
        )
    }
}

/**
 * Wrapper for two different functions that check whether the user can start/review a lecture
 * @param userProfile Contains information about user. See more in the description of each function.
 * @param {boolean} oneTalkOnly Indicates whether the experiment setting is to complete only one lecture
 * @returns {{enableReview: *[], enableStart: *[]}|{enableReview: (boolean|string), enableStart: (boolean|string)}}
 */
function checkWatchReviewConditions(userProfile, oneTalkOnly) {
    if (oneTalkOnly) {
        return checkSingleTalkWatchReviewCondition(userProfile)
    } else {
        return checkMultiTalkWatchReviewConditions(userProfile)
    }
}

/**
 * Determines whether the user can start/review a lecture when only one needs to be completed.
 * @param userProfile Contains information on whether:
 *  1. self-confirmed consent forms, 2. admin confirmed consent forms
 *  3. each talk has been finished (property name: talk_0/1/2/...)
 *  4. each consent form has been self-confirmed (property name: sub_ques_1/2/...)
 *  5. student id, first name, last name, and more (not used in this function).
 * @param {boolean} userProfile.confirmed Whether self-confirmed consent forms
 * @param {boolean} userProfile.adminConfirmed Whether admin confirmed consent forms
 * @returns {{enableReview: (boolean|string), enableStart: (boolean|string)}}
 */
function checkSingleTalkWatchReviewCondition(userProfile) {
    let enableStart = userProfile.confirmed ? true : "confirm";
    let enableReview = (userProfile['sub_ques_1'] && userProfile['talk_1']) ? true : "questionnaire";

    // because the remote server checks if the user has completed the intro first
    // we have to surpass this by reporting completion of talk 0.
    if (!userProfile['talk_0']) {
        fetch("/workshop/progress", {
            method: 'POST',
            body: JSON.stringify({
                userInfo: userInfo,
                talkId: '0',
                checkpoint: "end_time",
                timestamp: -1,
            })
        }).then(res => res.json())
            .then(data => console.log(data))
            .catch(err => console.error(err))
    }

    return {
        enableStart,
        enableReview
    }
}

/**
 * Determines whether the user can start/review for all lectures.
 * @param userProfile Contains information on whether:
 *  1. self-confirmed consent forms, 2. admin confirmed consent forms
 *  3. each talk has been finished (property name: talk_0/1/2/...)
 *  4. each consent form has been self-confirmed (property name: sub_ques_1/2/...)
 *  5. student id, first name, last name, and more (not used in this function).
 * @param {boolean} userProfile.confirmed Whether self-confirmed consent forms
 * @param {boolean} userProfile.adminConfirmed Whether admin confirmed consent forms
 * @returns {{enableReview: any[], enableStart: any[]}}
 */
function checkMultiTalkWatchReviewConditions(userProfile) {
    let talkHistoryFiltered = {};
    for (let key of Object.keys(userProfile)) {
        if (key.includes("talk")) {
            talkHistoryFiltered[key] = userProfile[key]
        }
    }
    const n_talks = Object.keys(talkHistoryFiltered).length;

    // only when all lectures have been completed the user will be allowed to review
    let allViewed = true;
    for (let key of Object.keys(talkHistoryFiltered)) {
        allViewed = allViewed && talkHistoryFiltered[key];
    }
    let enableReview = new Array(n_talks).fill(allViewed);
    // introduction can be reviewed for many times
    enableReview[0] = true;

    // only when the user has completed introduction session the rest lecture are available
    let enableStart;
    if (talkHistoryFiltered["talk_0"]) {
        // talk_0 has been finished
        enableStart = new Array(n_talks).fill(true);
        if (enforcingViewOrder) {
            // enforcingViewOrder is defined at the very beginning of scripts
            // enforcing the view order. users have to complete the previous lecture to proceed.
            let lastViewedLecture = 0;
            for (let i = 1; i < n_talks; i++) {
                if (talkHistoryFiltered[`talk_${i}`]) {
                    lastViewedLecture = i;
                } else {
                    break
                }
            }
            const lecturesToDisable = Math.max(0, enableStart.length - (lastViewedLecture + 2));
            // fill the last lecturesToDisable as false
            enableStart.splice(lastViewedLecture + 2,
                lecturesToDisable,
                ...new Array(lecturesToDisable).fill(`talk_${lastViewedLecture + 1}`))
        }

        if (enforcingSubjectQuestionnaire) {
            // enforcingSubjectQuestionnaire is defined at the very beginning of scripts
            // enforcing users to fill subjective questionnaires.
            // users have to complete the subjective questionnaires to proceed.
            if (talkHistoryFiltered[`talk_1`] && !userProfile["sub_ques_1"]) {
                // the user has completed talk 1, but not reported completion of first questionnaire
                enableStart.splice(2, n_talks, ...new Array(n_talks - 2).fill("questionnaire"));
            } else if (talkHistoryFiltered[`talk_4`] && !userProfile["sub_ques_2"]) {
                // the user has completed talk 4, but not reported completion of second questionnaire
                // do nothing right now.
            }
        }
    } else {
        enableStart = new Array(n_talks).fill("talk_0");
        // intro session is always available
        enableStart[0] = true;
    }

    // enforcing the consent forms
    if (userProfile.confirmed && userProfile.adminConfirmed) {
        // user self confirmed, admin has confirmed. Do nothing.
    } else if (!userProfile.confirmed && userProfile.adminConfirmed) {
        // user not self confirmed, but admin has confirmed.
        // still requires the user to confirm.
        enableStart.fill("confirm");
    } else if (userProfile.confirmed && !userProfile.adminConfirmed) {
        // user self confirmed, but admin has not confirmed yet
        enableStart = enableStart.slice(0, 2).concat(new Array(n_talks - 2).fill("admin_confirm"));
    } else if (!userProfile.confirmed && !userProfile.adminConfirmed) {
        // user have not self confirmed, and admin has not confirmed as well
        enableStart.fill("confirm");
    }

    return {
        enableStart,
        enableReview,
    }
}

/**
 * Creates a card (div element) for one specific talk.
 * @param {Object} talkInfo The information of the talk video.
 * @param {string} talkInfo.title The talk title.
 * @param {string} talkInfo.abstract The talk description.
 * @param {number} talkInfo.duration The talk duration.
 * @param {number} talkInfo.talkId The sequence number.
 * @param {boolean} talkInfo.availability If the talk is available.
 * @param {boolean} talkWatched Whether the student has watched the video or not.
 * @param {boolean|string} enableStart Whether to allow users start the video or not.
 * @param {boolean|string} enableReview Whether to allow users review the video or not.
 * @returns {HTMLDivElement}
 */
function createCard(talkInfo, talkWatched, enableStart, enableReview) {
    const colDiv = document.createElement("div"),
        cardDiv = document.createElement("div"),
        cardBodyDiv = document.createElement("div"),
        cardTitle = document.createElement("h5"),
        cardText = document.createElement("p"),
        buttonCardBodyDiv = document.createElement("div"),
        talkAdditionalUL = document.createElement("ul"),
        watchButton = document.createElement("a");
    const talkId = talkInfo.talkId,
        duration = talkInfo.duration;

    // adding class, id information
    colDiv.classList.add("col-md-6");
    colDiv.id = "talk-col-" + talkId;
    cardDiv.classList.add("card");
    cardDiv.id = "talk-card-" + talkId;
    cardBodyDiv.classList.add("card-body");
    cardBodyDiv.id = "talk-card-body-" + talkId;
    cardTitle.classList.add("card-title");
    cardTitle.id = "talk-card-title-" + talkId;
    if (+talkId === 0) {
        cardTitle.innerHTML = talkInfo.title;
    } else {
        cardTitle.innerHTML = `Lecture ${talkId}: ${talkInfo.title}`;
    }
    cardText.classList.add("card-text");
    cardText.id = "talk-card-text-" + talkId;
    cardText.innerHTML = talkInfo.abstract;
    buttonCardBodyDiv.classList.add("card-body");

    talkAdditionalUL.classList.add("list-group", "list-group-flush");

    watchButton.classList.add("btn");
    watchButton.id = "talk-watch-btn-" + talkId;
    if (talkInfo.availability) {
        let btnClass = [],
            btnText = "";

        const durationLI = document.createElement("li");
        durationLI.classList.add("list-group-item");
        durationLI.innerHTML = `<b>Duration</b>: ${+duration} minutes`
        const additionalActivityLI = document.createElement("li");
        additionalActivityLI.classList.add("list-group-item");
        additionalActivityLI.innerHTML = `<b>Testing</b>: ${talkId === 0 ? 1 : 10} minutes`
        talkAdditionalUL.append(durationLI, additionalActivityLI)

        if (talkWatched) {
            // review talk
            btnClass.push("btn-outline-secondary");
            btnText = "Review";
            if (enableReview === true) {
                // the user is allowed to review
                watchButton.addEventListener("click", () => {
                    localStorage.setItem("talkId", "" + talkId)
                })
                watchButton.href = "/student/workshop.html";
            } else {
                // the user is not allowed to review
                btnClass.push("disabled");
                const blockLI = document.createElement("li");
                blockLI.classList.add("list-group-item");

                if (enableReview === false) {
                    blockLI.innerHTML = `<b>Please complete all lectures to review.</b>`
                    talkAdditionalUL.append(blockLI);
                } else if (enableReview === "questionnaire") {
                    // the user is not allowed to review because subjective questionnaire is not done
                    // this is used when only one talk is required to be completed
                    blockLI.innerHTML = `<b>Please complete the questionnaire to review.</b>`
                    talkAdditionalUL.append(blockLI);
                }
            }
        } else {
            // first time
            btnText = "Start";

            if (enableStart === true) {
                // the user is allowed to start
                btnClass.push("btn-outline-primary");
                watchButton.addEventListener("click", () => {
                    localStorage.setItem("talkId", "" + talkId)
                })
                watchButton.href = "/student/workshop.html";
            } else {
                // the user is not allowed to start
                btnClass.push("btn-outline-secondary");
                btnClass.push("disabled");
                const blockLI = document.createElement("li");
                blockLI.classList.add("list-group-item");
                // display the reason why the talk is not available
                if (enableStart === "talk_0") {
                    blockLI.innerHTML = `<b>Please complete the introductory session first.</b>`
                } else if (enableStart.startsWith("talk")) {
                    const lectureID = enableStart.split("_")[1];
                    blockLI.innerHTML = `<b>Please complete Lecture ${lectureID} first.</b>`
                } else if (enableStart === "confirm") {
                    // due to "confirm"
                    blockLI.innerHTML = `<b>Please sign your consent forms to continue.</b>`
                } else if (enableStart === "questionnaire") {
                    // due to not completing the subjective questionnaire
                    blockLI.innerHTML = `<b>Please complete the questionnaire about your experience to continue.</b>`
                } else {
                    // due to "admin-confirm"
                    blockLI.innerHTML = `<b>Administrators are confirming your consent forms.</b>`
                }

                talkAdditionalUL.append(blockLI);
            }
        }

        watchButton.classList.add(...btnClass);
        watchButton.innerText = btnText;
    } else {
        watchButton.classList.add("btn-outline-secondary", "disabled");
        watchButton.innerText = "Not Available";
    }

    // nesting the elements
    buttonCardBodyDiv.append(watchButton)
    cardBodyDiv.append(
        cardTitle,
        cardText
    );

    if (+talkId === 0 && !oneTalkOnly) {
        // additional claim for the introduction session
        const additionalCardText = document.createElement("p");
        additionalCardText.classList.add("card-text");
        additionalCardText.id = "talk-card-additional-text-" + talkId;
        additionalCardText.innerHTML = "<b>This is not part of the formal study.</b>";
        cardBodyDiv.append(additionalCardText);
    }

    if (talkInfo.availability) {
        cardDiv.append(cardBodyDiv, talkAdditionalUL, buttonCardBodyDiv)
    } else {
        cardDiv.append(cardBodyDiv, buttonCardBodyDiv)
    }
    colDiv.append(cardDiv);

    return colDiv
}

/**
 * Convert the name of consent form to a human-readable name.
 * @param {string} formName The name of the form.
 * @returns {string} The human-readable name of the form.
 */
function formNameToDescription(formName) {
    let description = "",
        formNameLower = formName.toLowerCase();
    if (formNameLower.includes("child")) {
        description = "Children and Parental Consent Form";
    } else if (formNameLower.includes("adolescent")) {
        description = "Adolescent and Parental Consent Form";
    } else if (formNameLower.includes("adult")) {
        description = "Consent Form";
    } else if (formNameLower.includes("parent")) {
        description = "Parental Consent Form";
    } else {
        description = "Consent Form";
    }

    return description
}

function formatSubjectiveQuestionnaire(questionnaires, userProfile) {
    // skip if we do not need to enforce users to complete the questionnaire
    if (!enforcingSubjectQuestionnaire) {
        document.getElementById("questionnaire-col").remove();
        return;
    }

    const links = questionnaires.links;
    const card = document.getElementById("questionnaire-card");
    const ul = document.getElementById("questionnaire-card-links");

    if (!ul || !card) return;

    const formatQ = function () {
        // formatting the links to questionnaires
        const li = document.createElement("li"),
            formName = document.createElement("span");
        let btn = document.createElement("a");

        li.classList.add("list-group-item", "d-flex", "justify-content-between", "align-items-start");

        formName.innerText = "Questionnaire";
        btn.classList.add("btn", "btn-sm", "btn-outline-primary");
        btn.innerText = "Fill";
        btn.href = links;
        btn.target = "_blank";

        li.append(formName, btn);
        ul.append(li);
    }

    function disableQ(reason) {
        // disable buttons and check boxes
        document.getElementById("confirm-questionnaire-card-check").disabled = true;
        document.getElementById("confirm-questionnaire-btn").disabled = true;
        // inform user why the questionnaire is disabled
        const li = document.createElement("li");
        li.classList.add("list-group-item", "d-flex", "justify-content-between", "align-items-start");
        li.innerHTML = `<b>${reason}</b>`;
        ul.append(li);
    }

    if (oneTalkOnly) {
        // there is only one talk in the list of all registered talks
        // this is the experiment setting where each user watches only one talk
        // sub questionnaire is enforced

        // Additional condition check.
        if (!userProfile[`talk_1`]) {
            // the user has not completed talk 1, the questionnaire is disabled.
            // inform user
            disableQ("Please complete Lecture 1 first.");
        } else {
            formatQ();

            if (userProfile["sub_ques_1"]) {
                // the user has completed the first questionnaire
                // this removes the link to subjective questionnaire
                if (document.querySelector("#questionnaire-card-links li")) {
                    document.querySelector("#questionnaire-card-links li a").remove();
                    // inform user
                    let btn = document.createElement("span");
                    btn.classList.add("badge", "bg-secondary");
                    btn.innerText = "Completed";
                    document.querySelector("#questionnaire-card-links li").insertAdjacentElement("beforeend", btn);
                    // remove unnecessary elements
                    document.getElementById("confirm-questionnaire-card-body").remove();
                }
            } else {
                // the user has completed the only talk, but have not confirmed the questionnaire
                // setup event listener
                document.getElementById("confirm-questionnaire-btn").addEventListener("click", (e) => {
                    onsubmit(e, "questionnaire-1");
                })
            }
        }

        // reordering the card position to after the only talk (talk 1)
        /** the talk id must not be 0 to make everything work normally. */
        const questionnaireCol = document.getElementById("questionnaire-col"),
            talkCol = document.getElementById("talk-col-1");
        talkCol.insertAdjacentElement("afterend", questionnaireCol);
    } else {
        // there are multiple talks to finish
        if (userProfile[`talk_1`] && !userProfile["sub_ques_1"]) {
            // the user has completed talk 1, but not reported completion of first questionnaire
            // the questionnaire card should be inserted after talk 1 but before talk 2
            formatQ();

            // reordering the card position to between talk 1 and talk 2
            // const questionnaireCol = document.getElementById("questionnaire-col"),
            //     talkCol = document.getElementById("talk-col-1");
            // talkCol.insertAdjacentElement("afterend", questionnaireCol);

            //setup event listener
            document.getElementById("confirm-questionnaire-btn").addEventListener("click", (e) => {
                onsubmit(e, "questionnaire-1");
            })
        } else if (userProfile[`talk_4`] && !userProfile["sub_ques_2"]) {
            // the user has completed talk 4, but not reported completion of second questionnaire
            // the questionnaire card should be inserted after the consent form card
            formatQ();

            //setup event listener
            document.getElementById("confirm-questionnaire-btn").addEventListener("click", (e) => {
                onsubmit(e, "questionnaire-2");
            })
        } else {
            document.getElementById("questionnaire-col").remove();
        }
    }
}

/**
 * Callback for handling submit event.
 * @param {Event} e The submit event.
 * @param {string} type Specifies which form is being confirmed.
 * Accepted values:
 *  "doc" for consent forms;
 *  "questionnaire" for subjective questionnaires;
 */
function onsubmit(e, type = "doc") {
    e.target.innerText = "Submitting...";
    e.target.disabled = true;

    const pureType = type.split("-")[0];

    if (document.getElementById(`confirm-${pureType}-card-check`).checked) {
        fetch("/workshop/progress", {
            method: "POST",
            body: JSON.stringify({
                userInfo: userInfo,
                checkpoint: "confirm",
                document: type,
            })
        }).then((res) => {
            if (res.ok) {
                alert("We have received your submission. Will refresh the page.");
                window.location.reload();
            } else {
                alert("Can not submit your request. Please retry or refresh the page.");
                e.target.innerText = "Submit";
                e.target.disabled = false;
                new Error("error happened when submitting");
            }
        }).catch((err) => {
            console.error(err);
            alert("Can not submit your request. Please retry or refresh the page.");
            e.target.innerText = "Submit";
            e.target.disabled = false;
        })
    } else {
        if (type === "confirm") {
            alert("Please confirm you have signed all forms(s).");
        } else if (type.includes("questionnaire")) {
            alert("Please confirm you have completed the questionnaire.");
        }

        e.target.innerText = "Submit";
        e.target.disabled = false;
    }
}
