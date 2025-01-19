const TEACHER = 2,
    updateInterval = 5,
    inferInterval = 1000;
let maxH,
    maxW,
    xOffset,
    yOffset,
    navbar_offset;
const margin = {top: 20, right: 30, bottom: 30, left: 100};
let cog_width;
let cog_height;
let x;
let y;

function syncCountdown() {
    // Check if use socket or not. If use socket, then do not countdown
    // Check if there is registered lectureInfo.
    let lectureInfo = JSON.parse(localStorage.getItem("lectureInfo"));
    if (SOCKET || lectureInfo === null) return;

    let countdown = setInterval(() => {

        let lectureTime = lectureInfo.lecture.time;
        let delay = lectureTime - Date.now();

        // countdown is over
        if (delay < 0) {
            clearInterval(countdown);
            syncStart()
        }
    }, 1000);
}

function syncStart() {
    if (!(gazeInfo || cogInfo) || syncing) return; // Nothing happen
    syncing = true;
    sync().catch(err => console.error(err));
}

// Basically come from client.js, but have to make some modifications
async function sync() {
    // 2021.1.4 instead of canvas, the visualization is moved to SVG.
    let containerRect = document.getElementById("websdk-iframe").getBoundingClientRect();

    maxH = containerRect.height;
    maxW = containerRect.width;
    xOffset = containerRect.left;
    yOffset = containerRect.top;
    navbar_offset = document.getElementById("nav-tab").getBoundingClientRect().height;

    d3.select("#container").insert("svg", "iframe").attr("id", "plotting_svg");
    d3.select("#container").insert("svg", "iframe").attr("id", "cognitive_svg");
    d3.select("#container").insert("svg", "iframe").attr("id", "action_svg");

    let svg = d3.select("#plotting_svg")
        .style('left', xOffset)
        .style('top', yOffset)
        .attr("width", maxW)
        .attr("height", maxH)
        .attr("font-family", "sans-serif");
    console.log('SVG set.');

    cog_width = 0.5 * maxW;
    cog_height = 0.15 * maxH;
    // Map percentage to coordinate
    x = d3.scaleLinear()
        .domain([0, 1])
        .range([margin.left, cog_width - margin.right]);
    y = d3.scaleBand()
        .domain(["Knowledge", "Attention"])
        .range([margin.top, cog_height - margin.bottom])
        .padding(0.1);

    let cog_svg = d3.select("#cognitive_svg")
        // .style('left', xOffset)
        .style('top', maxH + yOffset)
        .attr("width", cog_width)
        .attr("height", cog_height);
    cog_svg.append("g").call(xAxis);
    cog_svg.append("g").call(yAxis);
    console.log('Cognitive SVG set.');

    let act_svg = d3.select("#action_svg")
        .style('left', cog_width)
        .style('top', maxH + yOffset)
        .attr("width", cog_width)
        .attr("height", cog_height);
    console.log('Action SVG set.');

    console.log('Syncing...');
    let userInfo = {identity: TEACHER, number: null};

    let update = setInterval(async () => {
        // error in updateGazePoints() is handled here
        updateGazePoints(userInfo).catch(err => {
            clearInterval(update);
            console.log(err);
        });
    }, updateInterval * inferInterval);
}

async function signaling(endpoint, data, role) {
    // post...
    let headers = {'Content-Type': 'application/json'},
        body = JSON.stringify({...data, role: role});

    let res = await fetch(endpoint,
        {method: 'POST', body, headers}
    );

    return res.json();
    // error will be handled by parent function, because its async, error are returned in Promise
}

async function updateGazePoints(userInfo) {
    // decide what to post, then post using function signaling()
    let identity = userInfo['identity']; //teacher(2) or student(1)
    let studentNumber = userInfo['number'];
    // console.log(`identity ${identity}, studentNumber ${studentNumber}`) // debug line

    // This script could only be accessed by teacher, so no more identity check
    console.log('Updating teacher...')

    signaling(
        'gazeData/teacher',
        {
            stuNum: studentNumber,
            pts: []
        },
        identity
    ).then(res => {
        console.log(res);
        return res;
    }).then(result => {
        let animationTime = 1000; //ms
        let confusionRate = 0, inattentionRate = 0, total = result.cognitives.length;

        // [Adaptive] Follow openModal function to see how to adapt to different experiment settings
        // AoI visualization
        if (gazeInfo) {

            if (result.fixations.length === 0) {
                console.warn('No fixation is received from server.');
            } else {
                console.debug(result.result);

                result.fixations = result.fixations.map(fixation => Fixation.fromFixationData(fixation));
                result.fixations.forEach(fixation => {
                    fixation.y -= navbar_offset;
                    fixation.ymin -= navbar_offset;
                    fixation.ymax -= navbar_offset;
                });

                let [AoIs, TMatrix] = AoIBuilder(result.fixations, result.saccades, result.result);

                let confusedStudents = new Set();
                AoIs.forEach((AoI) => {
                    for (let stuNum of AoI.confusedStudents) {
                        if (confusedStudents.has(stuNum)) continue;
                        confusedStudents.add(stuNum);
                    }
                });
                confusionRate = confusedStudents.size;

                console.debug(AoIs);
                console.debug(TMatrix);

                showAoI(AoIs, animationTime);
                showTransition(AoIs, TMatrix, animationTime);
            }
        }

        // Cognitive bar chart
        if (cogInfo) { // gazeInfo off/on, cogInfo on
            // Show global cognitive information.
            if (total !== 0) {
                // Otherwise Number/0 will lead to NaN and hence no bar chart viz
                result.cognitives.forEach((cogInfo) => {
                    // cogInfo {stuNum: number, confusion: string[], inattention: number}
                    if (cogInfo.inattention > 0) ++inattentionRate;
                    if (!gazeInfo) {
                        if (cogInfo.confusion.some((state) => state === 'Confused')) ++confusionRate;
                    }
                })

                confusionRate = confusionRate / total;
                inattentionRate = inattentionRate / total;
            }

            showCognitive([confusionRate, inattentionRate], animationTime);
            showAction([confusionRate, inattentionRate], animationTime);
        } else { // no info post
            // do nothing
        }
        // error will be handled by parent function, because its async, error are returned in Promise

    });
}

// ==============================================================
// Socket.io timing control
if (SOCKET) {
    socket.on("teacher start", syncStart);
} else {
    syncCountdown();
}

// ==============================================================
// Visualization helper functions

// Plot axis of the figure
function xAxis(g) {
    return g.attr("transform", `translate(0,${margin.top})`)
        .call(d3.axisTop(x).ticks(4, "%").tickSizeOuter(0))
        .call(g => g.select(".domain").remove()) // Remove horizontal line
        .call(g => g.append("text")
            .attr("x", cog_width - margin.right - 40)
            .attr("fill", "currentColor")
            .text('Rate (%)'))
}

function yAxis(g) {
    return g.attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(2))
        .call(g => g.select(".domain").remove()) // Remove horizontal line
        .call(g => g.selectAll(".tick line")
            .call(line => line.remove())
        ); // remove tick line
}

function showCognitive(cogInfo, animationTime) {
    let t = d3.transition()
        .duration(animationTime);
    const textWidth = 45, textHeight = 14, opacity = 0.7;
    const colorDict = {
        'safe': "#06d6a0",
        'warning': "#ffd166",
        'danger': "#ef476f",
    };

    let gSelection = d3.select("#cognitive_svg")
        .selectAll("g.bar")
        .data(cogInfo.map((val, ord) => {
            return {val, ord}
        }))
        .join("g")
        .classed("bar", true);

    gSelection.selectAll("rect")
        .data(d => [d])
        .join(
            enter => enter.append("rect")
                .attr("x", d => x(0))
                .attr("y", d => d.ord === 0 ? y("Knowledge") : y("Attention"))
                .attr("height", d => y.bandwidth())
                .attr("fill", d => {
                    if (d.val < 1 / 3) return colorDict["safe"];
                    else if (d.val < 2 / 3) return colorDict["warning"];
                    else return colorDict["danger"];
                })
                .attr("opacity", opacity),
            update => update,
            exit => exit.call(g => g.remove())
        )
        .call(rect => rect.transition(t)
            .attr("width", d => x(1 - d.val) - x(0))
            .attr("fill", d => {
                if (d.val < 1 / 3) return colorDict["safe"];
                else if (d.val < 2 / 3) return colorDict["warning"];
                else return colorDict["danger"];
            })
        );

    gSelection.selectAll("text")
        .data(d => [d])
        .join(
            enter => enter.append("text")
                .attr("x", d => x(1 - d.val) + (x(1 - d.val) > x(0) + textWidth ? -textWidth : textWidth))
                .attr("y", d => (d.ord === 0 ? y("Knowledge") : y("Attention")) + textHeight)
                .attr("stroke", "black")
                .attr("fill", "none"),
            update => update,
            exit => exit.call(g => g.remove())
        )
        .call(rect => rect.transition(t)
            .attr("x", d => x(1 - d.val) + (x(1 - d.val) > x(0) + textWidth ? -textWidth : 1))
            .text(d => d3.format('.1%')(1 - d.val))
        );
}

function showAction(cogInfo, animationTime) {
    let knowledge = 1 - cogInfo[0],
        attention = 1 - cogInfo[1],
        action,
        color;
    let t = d3.transition()
        .duration(animationTime);
    const colorDict = {
        'safe': "#06d6a0",
        'warning': "#ffd166",
        'danger': "#ef476f",
    };

    if (attention < 1 / 3) {
        action = 'Draw attention';
        color = colorDict['danger'];
    } else if (knowledge < 1 / 3) {
        action = 'Repeat';
        color = colorDict['danger'];
    } else if (attention >= 2 / 3 && knowledge >= 2 / 3) {
        action = '';
        color = colorDict['safe'];
    } else if (attention > knowledge) {
        action = 'Repeat';
        color = colorDict['warning'];
    } else {
        action = 'Draw attention';
        color = colorDict['warning'];
    }

    let svg = d3.select("#action_svg")
        .data([{action, color}])

    svg.selectAll('text')
        .data(d => [d])
        .join(
            enter => enter.append("text")
                .attr("x", cog_width - margin.right)
                .attr("y", Math.floor(cog_height / 2))
                .attr("text-anchor", "end")
                .style("font-size", Math.floor(cog_height / 2) + 'px'),
            update => update,
            exit => exit.call(g => g.remove())
        )
        .call(text => text.transition(t)
            .text(d => d.action)
            .attr("fill", d => d.color)
            .attr("stroke", d => d.color)
        )
}
