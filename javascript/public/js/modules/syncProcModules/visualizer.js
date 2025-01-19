// =============================================
// Sync procedure - Visualizer
// =============================================
/**
 * All visualizations are supported by a library called D3.js.
 * Please check https://observablehq.com/@d3/learn-d3 for a great tutorial of D3.js.
 */


/**
 * Abstract class for visualizers, which visualize feedback.
 * @constructor
 */
class Visualizer {
    constructor() {
        this.colorDict = {
            'safe': "#06d6a0",
            'warning': "#ffd166",
            'danger': "#ef476f",
            'neutral': "#b5b1b2",
        };
    }

    // Public interface
    /**
     * Initialization. Must be implemented by subclasses.
     * @abstract
     */
    init() {
        throw new Error("Visualizer init() method must be implemented.");
    }

    /**
     * Visualize the response from the server. Must be implemented by subclasses.
     * @abstract
     */
    visualize() {
        throw new Error("Visualizer visualize() method must be implemented.")
    }
}

/**
 * The AoI visualizer. It visualizes the attention distribution.
 */
class AoIVisualizer extends Visualizer {
    /**
     * Creates an AoI visualizer.
     * @param {Object} AoIConfig Configurations of an AoI visualizer.
     * @param {number} AoIConfig.animationTime The duration of animation for colour/location changes.
     * @param {boolean} AoIConfig.showTransition Specifies whether to show the transition between AoIs.
     * @param {boolean} AoIConfig.showLabel Specifies whether to show the upper-left corner label on one AoI.
     * @param {boolean} AoIConfig.colorful Specifies whether the AoI color-codes the cognitive information.
     * @param {boolean} AoIConfig.onchange Specifies whether the AoI is always shown or shown when changes happen.
     */
    constructor(AoIConfig) {
        super();
        let {animationTime, showTransition = false, showLabel = false, colorful = true, onchange = false, topk = 1} = AoIConfig;

        // Control AoI
        this.strokeWidth = 10;
        this.showTransitionFlag = showTransition;
        this.showLabelFlag = showLabel;
        this.colorful = colorful;
        this.onchange = onchange;

        this.topk = topk;

        if (this.onchange) {
            this.previousAoIs = [];
        }

        console.log(`AoI config: 
            showTransitionFlag - ${this.showTransitionFlag}, 
            showLabelFlag - ${this.showLabelFlag}, 
            colorful - ${this.colorful},
            onchange - ${this.onchange}`
        )

        // Control transmission arrow
        this.theta = 30;
        this.arrowLen = 20;
        this.margin = 10;
        this.arrowWidth = 20;

        // Control monochrome AoI opacity
        this.neutralOpacity = 0.8;

        this.animationTime = animationTime;
    }

    // Public interface
    init() {
        /**
         * Setting maxH and maxW seems to be duplicated...
         * @todo Remember to check whether use local variables or global variables.
         * @todo Implement the resize event handler.
         */
        let containerRect = document.getElementById("container").getBoundingClientRect();
        let maxH = containerRect.height,
            maxW = containerRect.width;

        d3.select("#container").insert("svg", "iframe").attr("id", "plotting_svg");
        /** for testing */
            // d3.select("#container").insert("svg", "img").attr("id", "plotting_svg");

        let svg = d3.select("#plotting_svg")
                // .style('left', xOffset)
                // .style('top', yOffset)
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("font-family", "sans-serif");
        console.log('AoI SVG set.');
    }

    /**
     * Visualize AoIs and transitions between them.
     * @param {object} view - A view of student information prepared by controllers.
     * @param {Array} view.AoIList - An array of AoIs.
     * @param {Array} view.TMatrix - A N-by-N array, where N is the number of AoIs.
     */
    visualize(view) {
        const {AoIList, TMatrix} = view;

        this.showAoI(AoIList);
        if (this.showTransitionFlag) {
            this.showTransition(AoIList, TMatrix);
        }
    }

    end() {
        document.getElementById("plotting_svg").remove();
    }

    /**
     * Converts the list of AoIs into SVG rectangles.
     * @param {Array} AoIs - An array of AoIs.
     */
    showAoI(AoIs) {
        let AoI_data = this.filterAoIs(AoIs);
        this.previousAoIs = AoI_data;

        let t = d3.transition()
            .duration(this.animationTime);

        const removeG = g => {
                g.selectAll("rect")
                    .transition(t)
                    .attr("width", 0)
                    .attr("height", 0)
                    .remove();

                g.selectAll("text")
                    .transition(t)
                    .text(" ")
                    .remove();

                g.transition(t).remove();
            }

        let gSelection = d3.select("#plotting_svg")
            .selectAll("g.AoI")
            .data(AoI_data, d => d ? `slide-${d.slideId}-aoi-${d.aoiId}` : this.id)
            .join(
                enter => enter.append("g")
                    .classed("AoI", true)
                    .attr("id", d => `slide-${d.slideId}-aoi-${d.aoiId}`),
                update => update,
                exit => exit.call(removeG));

        gSelection.selectAll("rect.AoI")
            .data(d => [d])
            .join(
                enter => enter.append("rect")
                    .attr("x", d => d.xmin)
                    .attr("y", d => d.ymin)
                    .attr("width", 0)
                    .attr("height", 0)
                    .style("stroke-width", this.strokeWidth + "px")
                    .style("fill", d => d.colorDict[this.colorful ? d.getStatus() : "neutral"])
                    .style("fill-opacity", 0)
                    .style("stroke-opacity", d => this.colorful ? d.percentage : this.neutralOpacity)
                    .classed("AoI", true),
                update => update,
                exit => exit.remove() // should never be called? remove of <g> should have handled this.
            )
            .call(rect => rect.transition(t)
                .attr("x", d => d.xmin) // update rects in selection "update"
                .attr("y", d => d.ymin) // update rects in selection "update"
                .attr("width", d => d.xmax - d.xmin)
                .attr("height", d => d.ymax - d.ymin)
                .style("fill", d => d.colorDict[this.colorful ? d.getStatus() : "neutral"])
                .style("stroke", d => d.colorDict[this.colorful ? d.getStatus() : "neutral"])
                .style("stroke-opacity", d => this.colorful ? d.percentage : this.neutralOpacity)
            );

        if (this.showLabelFlag) {
            gSelection.selectAll("text")
                .data(d => [d])
                .join(
                    enter => enter.append("text")
                        .attr("x", d => d.xmin)
                        .attr("y", d => d.ymin)
                        .attr("dx", -this.strokeWidth / 2)
                        .attr("dy", -this.strokeWidth)
                        .text(d => "AoI ID: " + d.aoiId),
                    // .text(d => "#Confusion : "+d.status),
                    update => update.text(d => "AoI ID: " + d.aoiId),
                    exit => exit.remove() // should never be called? remove of <g> should have handled this.
                )
                .call(s => s.each(function (d) {
                    // console.log(this.getBBox());
                    return d.bbox = this.getBBox();
                }))
                .transition(t)
                .attr("x", d => d.xmin) // update rects in selection "update"
                .attr("y", d => d.ymin);

            gSelection.selectAll("rect.background")
                .data(d => [d])
                .join(
                    enter => enter.insert("rect", "text")
                        .attr("x", d => d.xmin - this.strokeWidth / 2)
                        .attr("y", d => d.ymin - d.bbox.height - this.strokeWidth / 2)
                        .attr("width", 0)
                        .attr("height", 0)
                        .classed("background", true),
                    update => update,
                    exit => exit.remove()
                ).transition(t)
                .attr("x", d => d.xmin - this.strokeWidth / 2) // update rects in selection "update"
                .attr("y", d => d.ymin - d.bbox.height - this.strokeWidth / 2) // update rects in selection "update"
                .attr("width", d => d.bbox.width + this.strokeWidth) // the background extends a little bit
                .attr("height", d => d.bbox.height)
                .style("fill", d => d.colorDict[this.colorful ? d.getStatus() : "neutral"])
                .style("opacity", d => this.colorful ? d.percentage : 0.5);
        }
    }

    /**
     * Visualize transitions between AoIs.
     * @param {Array} AoIs - An array of AoIs.
     * @param {Array} TMatrix - A N-by-N array, where N is the number of AoIs.
     */
    showTransition(AoIs, TMatrix) {
        let nTransition = d3.sum(d3.merge(TMatrix));

        let gSelection = d3.select("#plotting_svg")
            .selectAll("g.transition")
            .data(TMatrix)
            .join("g")
            .classed("transition", true);

        if (TMatrix.length === 1 || nTransition === 0) {
            gSelection.selectAll("path").data([]).exit(g => g.remove());
            return;
        } // No transition

        let t = d3.transition()
            .duration(this.animationTime);

        let AoIX = [];
        let AoIY = [];

        AoIs.forEach((AoI) => {
            AoIX[AoI.id] = ((AoI.xmin + AoI.xmax) / 2);
            AoIY[AoI.id] = ((AoI.ymin + AoI.ymax) / 2) + 1;
            // for transition calculation, otherwise initial arrow state calculation will throw error
        });

        gSelection.selectAll("path")
            .data((d, i) => {
                let dataList = [];
                for (let j = 0; j < d.length; j++) {
                    dataList.push({count: d[j], fixationId: i})
                }
                return dataList
            })
            .join("path")
            .attr("d", (d, i) => this.arrowGenerator(
                AoIX[d.fixationId], AoIY[d.fixationId], AoIX[d.fixationId] + 5, AoIY[d.fixationId] + 5,
                this.arrowWidth * d.count / nTransition, this.theta, this.arrowLen
            ))
            .attr("stroke", "#000")
            // .attr("fill", "url(#arrowGradient)")
            // .attr("stroke-width", d => arrowWidth*d.count/nTransition)
            .attr("opacity", d => d.count / nTransition)
            .transition(t)
            .attr("d", (d, i) => this.arrowGenerator(
                AoIX[d.fixationId], AoIY[d.fixationId], AoIX[i], AoIY[i],
                this.arrowWidth * d.count / nTransition, this.theta, this.arrowLen
            ))
    }

    /**
     * Generate an SVG path in the shape of an arrow.
     *                 P4
     *                 |\
     *               P5| \
     *         P6------|  \
     *         |           \P3 (toX, toY)
     *         |           /
     *         P0------|  /
     *               P1| /
     *                 |/
     *                 P2
     * @param {number} fromX - The X coordinate of start point.
     * @param {number} fromY - The Y coordinate of start point.
     * @param {number} toX - The X coordinate of end point.
     * @param {number} toY - The Y coordinate of end point.
     * @param {number} width - The width of the arrow shaft.
     * @param {number} [theta] - The angle of the arrowhead.
     * @param {number} [headlen] - The length of the arrowhead.
     * @returns {string} The SVG path string.
     */
    arrowGenerator(fromX, fromY, toX, toY, width, theta, headlen) {
        let pathString = "";

        theta = typeof (theta) != 'undefined' ? theta : 30;
        headlen = typeof (headlen) != 'undefined' ? headlen : 10;

        let angle = Math.atan2(toY - fromY, toX - fromX);
        let k = Math.tan(angle);
        let perpendicularAngle = angle - Math.PI / 2;

        let p0x = fromX + width / 2 * Math.cos(perpendicularAngle);
        let p0y = fromY + (width / 2 * Math.sin(perpendicularAngle)); // y axis is inversed in JS

        let p1x = (toX - headlen * Math.cos(angle)) + width / 2 * Math.cos(perpendicularAngle);
        let p1y = (toY - headlen * Math.sin(angle)) + width / 2 * Math.sin(perpendicularAngle);

        let p2x = p1x + width * Math.cos(perpendicularAngle);
        let p2y = p1y + (width * Math.sin(perpendicularAngle));

        let p6x = fromX - width / 2 * Math.cos(perpendicularAngle);
        let p6y = fromY - (width / 2 * Math.sin(perpendicularAngle));

        let p5x = (toX - headlen * Math.cos(angle)) - width / 2 * Math.cos(perpendicularAngle);
        let p5y = (toY - headlen * Math.sin(angle)) - width / 2 * Math.sin(perpendicularAngle);

        let p4x = p5x - width * Math.cos(perpendicularAngle);
        let p4y = p5y - width * Math.sin(perpendicularAngle);

        let curveAngle = angle - theta * Math.PI / 180;
        let curveLength = Math.round(Math.sqrt(Math.pow(fromY - toY, 2) + Math.pow(fromX - toX, 2)) * 0.1);

        let fromDX = curveLength * Math.cos(curveAngle);
        let fromDY = curveLength * Math.sin(curveAngle); // for Bézier Curves

        let toDX, toDY;
        if (k === Infinity || k === -Infinity) {
            toDX = fromDX;
            toDY = -fromDY; // for Bézier Curves
        } else if (k === 0) {
            toDX = -fromDX;
            toDY = fromDY; // for Bézier Curves
        } else {
            toDX = -(-fromDX * k * k + 2 * fromDY * k + fromDX) / (k * k + 1);
            toDY = -(fromDY * k * k + 2 * fromDX * k - fromDY) / (k * k + 1);
        }

        pathString += `M ${p0x} ${p0y} `;
        pathString += `C ${p0x + fromDX} ${p0y + fromDY}, ${(p1x + toDX)} ${(p1y + toDY)}, ${p1x} ${p1y} `;
        pathString += `L ${p2x} ${p2y} `;
        pathString += `L ${toX} ${toY} `;
        pathString += `L ${p4x} ${p4y} `;
        pathString += `L ${p5x} ${p5y} `;
        pathString += `C ${p5x + toDX} ${p5y + toDY}, ${(p6x + fromDX)} ${(p6y + fromDY)}, ${p6x} ${p6y} `;
        pathString += `Z`; // Z for close path

        // console.log(`angle: ${angle * 180 / Math.PI},  fromDX : ${fromDX}, fromDY : ${fromDY}, toDX : ${toDX}, toDY : ${toDY}`)
        // console.log(`Path genera ted : ${pathString}`);

        return pathString;
    }

    /**
     * Used when onchange mode is selected. Filters out unchanged AoIs.
     * @param newAoIs A list of AoIs in this update.
     * @todo this fails for top_k > 1.
     * Consider the top 2 AoIs are swapping their rank, this should not lead to change.
     * But we have ordered the AoIs by their percentage,
     * @returns {*[]|*}
     */
    filterAoIs(newAoIs) {
        const aois_sorted = newAoIs.sort((a, b) => b.percentage - a.percentage),
            aois_topk = aois_sorted.splice(0, this.topk); // if top k > length, all will be selected

        if (this.onchange) {
            // reorder the AoIs
            aois_topk.forEach((aoi, index) => {
                aoi.aoiId = index;
                aoi.slideId = "onchange";
            });

            // check if AoI information is the same or have changed
            let isSame = true;
            if (this.previousAoIs.length !== aois_topk.length) {
                isSame = false;
            } else {
                for (let i = 0; i < aois_topk.length; i++) {
                    let key_prop_new = JSON.stringify(aois_topk[i].keyProps),
                        key_prop_old = JSON.stringify(this.previousAoIs[i].keyProps);

                    if (key_prop_new !== key_prop_old) {
                        isSame = false;
                        break
                    }
                }
            }

            return isSame ? [] : aois_topk
        } else {
            return aois_topk
        }
    }
}

/**
 * AoI visualizer with confusion report.
 * @constructor
 * @param {number} animationTime - The duration of animation.
 * @param confusionReporter - The DataGenerator that is responsible to add confusion in DataManager.
 * @param mouseEventListener - The DataGenerator that is responsible to tracking mouse clicks in DataManager.
 */
export class InteractiveAoIVisualizer extends AoIVisualizer {
    constructor(AoIConfig, confusionReporter, mouseEventListener) {
        super(AoIConfig);
        console.log("Interactive AoI is set up.")
        this.confusionReporter = confusionReporter;
        this.mouseEventListener = mouseEventListener;
    }

    /**
     * Visualize AoIs and transitions between them.
     * @param {object} view - A view of student information prepared by controllers.
     * @param {Array} view.AoIList - An array of AoIs.
     * @param {Array} view.TMatrix - A N-by-N array, where N is the number of AoIs.
     */
    visualize(view) {
        super.visualize(view);
        this.setupConfusionHandlers();
    }

    /**
     * Set up the click event listener of AoIs.
     */
    setupConfusionHandlers() {
        d3.select("#plotting_svg")
            .selectAll("g.AoI")
            .on("click", (e, d) => {
                console.debug(`AoI clicked. Element ID - slide-${d.slideId}-aoi-${d.aoiId}`);
                let cb_confusion = this.confusionReporter.reportConfusion.bind(this.confusionReporter);
                cb_confusion(d);
                let cb_mouseclicks = this.mouseEventListener.aoiMouseclickListener.bind(this.mouseEventListener);
                cb_mouseclicks(e, d);
                this.clickAnimation(e, d);
            })
            .on("mouseenter", this.mouseoverAnimation) // overwrites the previous handler
            .on("mouseleave", this.mouseleaveAnimation)
    }

    /**
     * Visual feedback to users after clicking the AoI to report confusion.
     * @param {Event} e - The click event.
     * @param {SaliencyAoI} d - The data bound to the SVG, i.e., SaliencyAoI
     */
    clickAnimation(e, d) {
        d3.select(`#${d.DOMId}`)
            .select("rect.AoI")
            .transition()
            .style("fill-opacity", 1)
            .transition()
            .style("fill-opacity", 0)
    }

    /**
     * Visual feedback to users after hovering mouse on an AoI.
     * @param {Event} e - The mouseover event.
     * @param {SaliencyAoI} d - The data bound to the SVG, i.e., SaliencyAoI
     */
    mouseoverAnimation(e, d) {
        d3.select(`#${d.DOMId}`)
            .select("rect.AoI")
            .transition()
            .attr("x", d => d.xmin - 20)
            .attr("y", d => d.ymin - 20)
            .attr("width", d => (d.xmax + 20) - (d.xmin - 20))
            .attr("height", d => (d.ymax + 20) - (d.ymin - 20))
            .style("fill-opacity", 0)
    }

    /**
     * Visual feedback to users when cursor leaves an AoI.
     * @param {Event} e - The mouseleave event.
     * @param {SaliencyAoI} d - The data bound to the SVG, i.e., SaliencyAoI
     */
    mouseleaveAnimation(e, d) {
        d3.select(`#${d.DOMId}`)
            .select("rect.AoI")
            .transition()
            .attr("x", d => d.xmin)
            .attr("y", d => d.ymin)
            .attr("width", d => d.xmax - d.xmin)
            .attr("height", d => d.ymax - d.ymin)
            .style("fill-opacity", 0)
    }
}

class CogBarVisualizer extends Visualizer {
    constructor(cogBarConfig) {
        super();
        const {
            margin, xOffset = 0, yOffset = 0, cog_width, cog_height, animationTime
        } = cogBarConfig;

        this.margin = margin;
        this.xOffset = xOffset;
        this.yOffset = yOffset;
        this.cog_width = cog_width;
        this.cog_height = cog_height;

        this.animationTime = animationTime;

        this.x = d3.scaleLinear()
            .domain([0, 1])
            .range([margin.left, cog_width - margin.right]);

        this.y = d3.scaleBand()
            .domain(["Knowledge", "Attention"])
            .range([margin.top, cog_height - margin.bottom])
            .padding(0.1);
    }

    init() {
        let containerRect = document.getElementById("container").getBoundingClientRect();
        let maxH = containerRect.height,
            maxW = containerRect.width,
            cog_width = 0.5 * maxW,
            cog_height = 0.1 * maxH;

        d3.select("#container").insert("svg", "iframe").attr("id", "cognitive_svg");

        let cog_svg = d3.select("#cognitive_svg")
            .style('left', this.xOffset + "px")
            .style('top', this.yOffset)
            .attr("width", cog_width)
            .attr("height", cog_height);
        cog_svg.append("g").call(this.xAxis.bind(this));
        cog_svg.append("g").call(this.yAxis.bind(this));
        // Pass method as callback will lose reference to the original objext

        console.log('Cognitive SVG set.');
    }

    end() {
        document.getElementById("cognitive_svg").remove();
    }

    /**
     * Visualize general cognitive information of students.
     * @param {object} view - A view of student information prepared by controllers.
     * @param {Array} view.ratioList - [confusionRatio, inattentionRatio]
     */
    visualize(view) {
        const {ratioList} = view;
        let t = d3.transition()
            .duration(this.animationTime);
        const textWidth = 45, textHeight = 14, opacity = 0.7;

        let gSelection = d3.select("#cognitive_svg")
            .selectAll("g.bar")
            .data(ratioList.map((val, ord) => {
                return {val, ord}
            }))
            .join("g")
            .classed("bar", true);

        gSelection.selectAll("rect")
            .data(d => [d])
            .join(
                enter => enter.append("rect")
                    .attr("x", d => this.x(0))
                    .attr("y", d => d.ord === 0 ? this.y("Knowledge") : this.y("Attention"))
                    .attr("height", d => this.y.bandwidth())
                    .attr("fill", d => {
                        if (d.val < 1 / 3) return this.colorDict["safe"];
                        else if (d.val < 2 / 3) return this.colorDict["warning"];
                        else return this.colorDict["danger"];
                    })
                    .attr("opacity", opacity),
                update => update,
                exit => exit.call(g => g.remove())
            )
            .call(rect => rect.transition(t)
                .attr("width", d => this.x(1 - d.val) - this.x(0))
                .attr("fill", d => {
                    if (d.val < 1 / 3) return this.colorDict["safe"];
                    else if (d.val < 2 / 3) return this.colorDict["warning"];
                    else return this.colorDict["danger"];
                })
            );

        gSelection.selectAll("text")
            .data(d => [d])
            .join(
                enter => enter.append("text")
                    .attr("x", d => this.x(1 - d.val) + (this.x(1 - d.val) > this.x(0) + textWidth ? -textWidth : textWidth))
                    .attr("y", d => (d.ord === 0 ? this.y("Knowledge") : this.y("Attention")) + textHeight)
                    .attr("stroke", "black")
                    .attr("fill", "none"),
                update => update,
                exit => exit.call(g => g.remove())
            )
            .call(rect => rect.transition(t)
                .attr("x", d => this.x(1 - d.val) + (this.x(1 - d.val) > this.x(0) + textWidth ? -textWidth : 1))
                .text(d => d3.format('.1%')(1 - d.val))
            );
    }

    // Plot axis of the figure
    xAxis(g) {
        return g.attr("transform", `translate(0,${this.margin.top})`)
            .call(d3.axisTop(this.x).ticks(4, "%").tickSizeOuter(0))
            .call(g => g.select(".domain").remove()) // Remove horizontal line
            .call(g => g.append("text")
                .attr("x", this.cog_width - this.margin.right - 40)
                .attr("fill", "currentColor")
                .text('Rate (%)'))
            .call(g => g.attr("font-size", 14)
                .attr("font-family", "sans-sarif")
            )
    }

    yAxis(g) {
        return g.attr("transform", `translate(${this.margin.left},0)`)
            .call(d3.axisLeft(this.y).ticks(2))
            .call(g => g.select(".domain").remove()) // Remove horizontal line
            .call(g => g.selectAll(".tick line")
                .call(line => line.remove()) // remove tick line
            ).call(g => g.attr("font-size", 14)
                .attr("font-family", "sans-sarif")
            );
    }
}

/**
 * A banner showing the action suggestion for instructor.
 * @constructor
 * @param {number} animationTime - The duration of animation.
 * @param confusionReporter - The DataGenerator that is responsible to add confusion in DataManager.
 * @param mouseEventListener - The DataGenerator that is responsible to tracking mouse clicks in DataManager.
 */
class ActionVisualizer extends Visualizer {
    constructor(actionConfig) {
        super();
        const {
            margin, act_width, act_height, xOffset = act_width, yOffset = 0,
            animationTime, asbanner = false
        } = actionConfig;

        this.margin = margin;
        this.xOffset = xOffset;
        this.yOffset = yOffset;
        this.act_width = act_width;
        this.act_height = act_height;

        this.animationTime = animationTime;

        this.asbanner = asbanner;

        console.log(`Action viz config: 
            banner - ${this.asbanner}, 
        `);
    }

    // Public interface
    init() {
        let containerRect = document.getElementById("container").getBoundingClientRect();
        let maxH = containerRect.height,
            maxW = containerRect.width,
            cog_width = 0.5 * maxW,
            cog_height = 0.1 * maxH;

        d3.select("#container").append("svg", "iframe").attr("id", "action_svg");

        let act_svg = d3.select("#action_svg")
            .style('left', this.xOffset + "px")
            .style('top', this.yOffset)
            .attr("width", cog_width)
            .attr("height", cog_height);
        console.log('Action SVG set.');

        if (this.asbanner) {
            const text = act_svg.append("text")
                .attr("x", 0)
                .attr("y", Math.floor(this.act_height / 2))
                .style("font-size", Math.floor(this.act_height / 4) + 'px')
                .attr("fill", this.colorDict.danger)
                .attr("stroke", this.colorDict.danger)

            text.append("tspan")
                .attr("x", 0)
                .text("Click anywhere to report confusion.")
        }
    }

    end() {
        document.getElementById("action_svg").remove();
    }

    /**
     * Prompt suggested actions based on general cognitive information of students.
     * @param {object} view - A view of student information prepared by controllers.
     * @param {Array} view.ratioList - [confusionRatio, inattentionRatio]
     */
    visualize(view) {
        if (this.asbanner) {
            return
        }

        const {ratioList} = view;
        let knowledge = 1 - ratioList[0],
            attention = 1 - ratioList[1],
            action,
            color;
        let t = d3.transition()
            .duration(this.animationTime);

        if (attention < 1 / 3) {
            action = 'Draw attention';
            color = this.colorDict['danger'];
        } else if (knowledge < 1 / 3) {
            action = 'Repeat';
            color = this.colorDict['danger'];
        } else if (attention >= 2 / 3 && knowledge >= 2 / 3) {
            action = '';
            color = this.colorDict['safe'];
        } else if (attention > knowledge) {
            action = 'Repeat';
            color = this.colorDict['warning'];
        } else {
            action = 'Draw attention';
            color = this.colorDict['warning'];
        }

        let svg = d3.select("#action_svg")
            .data([{action, color}])

        svg.selectAll('text')
            .data(d => [d])
            .join(
                enter => enter.append("text")
                    .attr("x", this.act_width - this.margin.right)
                    .attr("y", Math.floor(this.act_height / 2))
                    .attr("text-anchor", "end")
                    .style("font-size", Math.floor(this.act_height / 2) + 'px'),
                update => update,
                exit => exit.call(g => g.remove())
            )
            .call(text => text.transition(t)
                .text(d => d.action)
                .attr("fill", d => d.color)
                .attr("stroke", d => d.color)
            )
    }
}

/**
 * Factory function that provides the visualizers according to the trial setting.
 * @param {string[]} visualizers - See {@link visualizerNames}.
 * @param {Object} configurations - Configurations of the visualizers.
 * @param confusionReporter - The DataGenerator that sets up event handlers for interactive AoI.
 * @param MouseEventListener - The DataGenerator that sets up mouseclick event handlers for interactive AoI.
 * @returns {Visualizer[]}
 */
export default function visualizerFactory(visualizers, configurations, confusionReporter, MouseEventListener) {
    let visualizerList = [];
    let {AoIConfig, cogBarConfig, actionConfig} = configurations;

    for (let visualizer of visualizers) {
        switch (visualizer.split("-")[0]) {
            case "aoi":
                configurations = visualizer.split("-").splice(1)

                for (let config of configurations) {
                    if (config === "monochrome") AoIConfig.colorful = false;
                    else if (config === "onchange") AoIConfig.onchange = true;
                }

                if (configurations.includes("interactive")) {
                    if (confusionReporter === undefined) {
                        console.warn("Trying to use interactive AoI without providing a confusion reporter. Will use fallback AoI visualizer.")
                        if (!visualizers.includes("aoi")) {
                            visualizerList.push(new AoIVisualizer(AoIConfig));
                        }
                    } else {
                        visualizerList.push(new InteractiveAoIVisualizer(AoIConfig, confusionReporter, MouseEventListener));
                    }
                } else {
                    visualizerList.push(new AoIVisualizer(AoIConfig));
                }
                break
            case "cogbar":
                visualizerList.push(new CogBarVisualizer(cogBarConfig));
                break
            case "action":
                configurations = visualizer.split("-").splice(1);

                for (let config of configurations) {
                    if (config === "asbanner") actionConfig.asbanner = true;
                }

                visualizerList.push(new ActionVisualizer(actionConfig));
                break
            case "none":
            default:
                break
        }
    }

    return visualizerList
}