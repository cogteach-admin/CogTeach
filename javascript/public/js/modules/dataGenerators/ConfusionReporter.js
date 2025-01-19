import DataGenerator from "./DataGenerator.js";

class ConfusionReporter extends DataGenerator {
    constructor() {super();}
    reportConfusion() {}
    generateData() {}
}

/**
 * The class that handles self-reported confusion from AoI.
 * Works closely with {@link InteractiveAoIVisualizer}.
 * @constructor
 * @param dataManager - The data manager that gathers all data to be posted.
 */
class AoIConfusionReporter extends ConfusionReporter {
    constructor(dataManager) {
        super();
        this.dataManager = dataManager;
    }
    /**
     * The callback
     * @param {SaliencyAoI} d - The data bound to the SVG, i.e., SaliencyAoI
     */
    reportConfusion(d) {
        this.dataManager.addReportedConfusion(d.slideId, d.aoiId, new Date().getTime())
    }
    generateData() {}
}

/**
 * The class that generates random confusion data for testing.
 * @constructor
 * @param dataManager - The data manager that gathers all data to be posted.
 */
class RandomConfusionReporter extends ConfusionReporter {
    constructor(dataManager) {
        super();
        this.dataManager = dataManager;
    }
    /**
     * The callback
     * @param {number|string} slideId - Set the slideId
     * @param {number|string} aoiId - Set the aoiId
     */
    reportConfusion(slideId, aoiId) {
        this.dataManager.addReportedConfusion(slideId, aoiId, new Date().getTime())
    }
    generateData() {}
}

/**
 * The class that records confusion data reported from a button.
 * @constructor
 * @param dataManager - The data manager that gathers all data to be posted.
 */
class ButtonConfusionReporter extends ConfusionReporter {
    constructor(dataManager) {
        super();
        this.dataManager = dataManager;
        this.btn = document.getElementById("confused_report_btn");
        this.btn.addEventListener("mousedown", (e) => {
            e.target.style.background = "white";
        })
        this.btn.addEventListener("click", this.clickHandler.bind(this));
        this.btn.hidden = false;
    }
    /**
     * The callback
     * @param {number|string} slideId - Set the slideId
     * todo: the aoiid is not available for button-based reporter. Need more changes,
     */
    reportConfusion(slideId) {
        this.dataManager.addReportedConfusion(slideId, -1, new Date().getTime())
    }
    clickHandler (e) {
        this.reportConfusion(slideId);
        e.target.style.background = "grey";
    }
    generateData() {}
}

/**
 * The class that records confusion data reported from clicking on the screen.
 * @constructor
 * @param dataManager - The data manager that gathers all data to be posted.
 */
class ScreenConfusionReporter extends ConfusionReporter {
    constructor(dataManager) {
        super();
        this.dataManager = dataManager;

        let containerDiv = document.getElementById("container");
        containerDiv.addEventListener("click", this.clickHandler.bind(this));
        // let containerRect = containerDiv.getBoundingClientRect();
        // let maxH = containerRect.height,
        //     maxW = containerRect.width;

        d3.select("#container").append("svg")
            .attr("id", "confusion_svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("font-family", "sans-serif")
            .attr("font-size", "25");
        console.log('Confusion SVG set.');
    }

    /**
     * The callback
     * @param {MouseEvent} e - click event.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/click_event
     */
    reportConfusion(e) {
        this.dataManager.addReportedConfusion(e.clientX, e.clientY)
    }

    clickHandler (e) {
        this.reportConfusion(e);
        // visual feedback to the usr for reporting confusion
        let t_quick = d3.transition()
            .duration(500),
            t_slow = d3.transition()
            .duration(1000);

        let r = 30;

        d3.select("#confusion_svg")
            .append("circle")
            .attr("cx", e.clientX + "px")
            .attr("cy", e.clientY + "px")
            .style("fill", "#ef476f")
            .style("fill-opacity", "0.3")
            .attr("r", "0px")
            .transition(t_quick)
            .attr("r", r + "px")
            .transition(t_slow)
            .attr("r", "0px")
            .remove()

        d3.select("#confusion_svg")
            .append("text")
            .attr("x", `${e.clientX - 3 * r}`)
            .attr("y", `${e.clientY - Math.floor(1.5 * r)}`)
            .style("fill", "#ef476f")
            .text(" ")
            .transition(t_quick)
            .text("I am confused here!")
            .transition(t_quick)
            .attr(" ")
            .remove()
    }

    generateData() {}
}

/**
 * Factory function that provides the ConfusionReporter.
 * @param {Object} settings - Trial setting.
 * @param {string} settings.confusionReporterName - See {@link confusionReporterName}.
 * @param {DataManager} dataManager - Managing gaze estimations.
 * @returns {ConfusionReporter|RandomConfusionReporter}
 */
export default function confusionReporterFactory(settings, dataManager) {
    const {confusionReporterName} = settings;

    switch (confusionReporterName) {
        case "button":
            return new ButtonConfusionReporter(dataManager);
        case "screen":
            return new ScreenConfusionReporter(dataManager);
        case "random":
            return new RandomConfusionReporter(dataManager);
        case "aoi":
            return new AoIConfusionReporter(dataManager);
        case "none":
        default:
            return new ConfusionReporter();
    }

}