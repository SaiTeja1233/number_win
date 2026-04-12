/* global BigInt */

import React, { useEffect, useState, useCallback, useRef } from "react";
import "./OneMinWingo.css";
import { useNavigate } from "react-router-dom";
import { getISTTime, fetchOptimizedData } from "../../predictionLogic";
import RefreshIcon from "./RefreshIcon";
import LoadingSpinner from "./LoadingSpinner";

// ==================== ADVANCED PREDICTION LOGIC ====================

/**
 * Utility: Determines if a number is SMALL (0-4) or BIG (5-9)
 */
const getSize = (num) => {
    return num <= 4 ? "SMALL" : "BIG";
};

/**
 * Utility: Determines if a number is RED (even) or GREEN (odd)
 * Special cases: 0 = RED, 5 = GREEN
 */
const getColor = (num) => {
    if (num === 0) return "RED";
    if (num === 5) return "GREEN";
    return num % 2 === 0 ? "RED" : "GREEN";
};

/**
 * COLOR PREDICTION LOGIC
 * Analyzes historical color patterns to predict next color.
 */
const getColorPrediction = (historyArray) => {
    if (historyArray.length < 3)
        return {
            type: "WAIT",
            reason: "Need more data",
            predict: null,
            confidence: "LOW",
        };

    const lastResults = historyArray.slice(0, 10);
    const colors = lastResults.map((r) => r.color);

    // 1. Dragon Trend Detection (streak of 3 or more identical colors)
    let currentStreak = 1;
    for (let i = 0; i < colors.length - 1; i++) {
        if (colors[i] === colors[i + 1]) currentStreak++;
        else break;
    }

    if (currentStreak >= 3) {
        return {
            predict: colors[0] === "RED" ? "GREEN" : "RED",
            type: "DRAGON_BREAK",
            confidence: "HIGH",
            reason: `${colors[0]} streak of ${currentStreak} - expecting opposite`,
        };
    }

    // 2. Mirror Trend Detection (AB-AB pattern)
    if (
        colors.length >= 4 &&
        colors[0] !== colors[1] &&
        colors[1] === colors[2] &&
        colors[2] !== colors[3]
    ) {
        return {
            predict: colors[1] === "RED" ? "GREEN" : "RED",
            type: "MIRROR",
            confidence: "MEDIUM",
            reason: "AB-AB mirror pattern - expecting opposite",
        };
    }

    // 3. Imbalance correction (extreme dominance of one color in last 10)
    const redCount = colors.filter((c) => c === "RED").length;
    const greenCount = colors.filter((c) => c === "GREEN").length;

    if (redCount >= 7) {
        return {
            predict: "GREEN",
            type: "CORRECTION",
            confidence: "HIGH",
            reason: `RED overload (${redCount}/10) → expecting GREEN`,
        };
    }
    if (greenCount >= 7) {
        return {
            predict: "RED",
            type: "CORRECTION",
            confidence: "HIGH",
            reason: `GREEN overload (${greenCount}/10) → expecting RED`,
        };
    }

    // 4. Alternating pattern detection
    let alternations = 0;
    for (let i = 0; i < colors.length - 1; i++) {
        if (colors[i] !== colors[i + 1]) alternations++;
    }
    const altRate = colors.length > 1 ? alternations / (colors.length - 1) : 0;

    if (altRate > 0.7) {
        const lastColor = colors[0];
        return {
            predict: lastColor === "RED" ? "GREEN" : "RED",
            type: "ALTERNATING",
            confidence: "MEDIUM",
            reason: "High alternation pattern",
        };
    }

    // Default: Opposite of most frequent in last 5
    const last5Colors = colors.slice(0, 5);
    const freq = {};
    for (let c of last5Colors) {
        freq[c] = (freq[c] || 0) + 1;
    }
    let mostFrequent = last5Colors[0];
    for (let c in freq) {
        if (freq[c] > freq[mostFrequent]) mostFrequent = c;
    }

    return {
        predict: mostFrequent === "RED" ? "GREEN" : "RED",
        type: "REVERSAL",
        confidence: "MEDIUM",
        reason: `Most frequent ${mostFrequent} → expecting opposite`,
    };
};

/**
 * SIZE PREDICTION LOGIC
 * Analyzes historical size patterns to predict next size.
 */
const getSizePrediction = (historyArray) => {
    if (historyArray.length < 3)
        return {
            type: "WAIT",
            reason: "Need more data",
            predict: null,
            confidence: "LOW",
        };

    const lastResults = historyArray.slice(0, 10);
    const sizes = lastResults.map((r) => r.size);

    // 1. Dragon streak break
    let currentStreak = 1;
    for (let i = 0; i < sizes.length - 1; i++) {
        if (sizes[i] === sizes[i + 1]) currentStreak++;
        else break;
    }

    if (currentStreak >= 3) {
        return {
            predict: sizes[0] === "SMALL" ? "BIG" : "SMALL",
            type: "STREAK_BREAK",
            confidence: "HIGH",
            reason: `${sizes[0]} streak of ${currentStreak} - expecting opposite`,
        };
    }

    // 2. Alternating pattern detection
    let alternations = 0;
    for (let i = 0; i < sizes.length - 1; i++) {
        if (sizes[i] !== sizes[i + 1]) alternations++;
    }
    const altRate = sizes.length > 1 ? alternations / (sizes.length - 1) : 0;

    if (altRate > 0.7) {
        const lastSize = sizes[0];
        return {
            predict: lastSize === "SMALL" ? "BIG" : "SMALL",
            type: "ALTERNATING",
            confidence: "MEDIUM",
            reason: "High alternation pattern",
        };
    }

    // 3. Imbalance correction
    const bigCount = sizes.filter((s) => s === "BIG").length;
    const smallCount = sizes.filter((s) => s === "SMALL").length;

    if (bigCount >= 7) {
        return {
            predict: "SMALL",
            type: "CORRECTION",
            confidence: "HIGH",
            reason: `BIG overload (${bigCount}/10) → expecting SMALL`,
        };
    }
    if (smallCount >= 7) {
        return {
            predict: "BIG",
            type: "CORRECTION",
            confidence: "HIGH",
            reason: `SMALL overload (${smallCount}/10) → expecting BIG`,
        };
    }

    // Default: Opposite of most frequent in last 5
    const last5Sizes = sizes.slice(0, 5);
    const freq = {};
    for (let s of last5Sizes) {
        freq[s] = (freq[s] || 0) + 1;
    }
    let mostFrequent = last5Sizes[0];
    for (let s in freq) {
        if (freq[s] > freq[mostFrequent]) mostFrequent = s;
    }

    return {
        predict: mostFrequent === "SMALL" ? "BIG" : "SMALL",
        type: "REVERSAL",
        confidence: "MEDIUM",
        reason: `Most frequent ${mostFrequent} → expecting opposite`,
    };
};

/**
 * DECISION ENGINE: Chooses whether to predict SIZE or COLOR
 */
function decidePredictionType(
    historyArray,
    lastWasLoss = false,
    previousType = null,
) {
    if (historyArray.length < 3)
        return { type: "color", reason: "Need more data" };

    const sizePrediction = getSizePrediction(historyArray);
    const colorPrediction = getColorPrediction(historyArray);

    // If last prediction was a loss, force switch to the other type
    if (lastWasLoss && previousType) {
        if (previousType === "size") {
            return {
                type: "color",
                reason: "LAST PREDICTION LOST → switching to COLOR",
            };
        } else if (previousType === "color") {
            return {
                type: "size",
                reason: "LAST PREDICTION LOST → switching to SIZE",
            };
        }
    }

    // If SIZE has HIGH confidence, use SIZE
    if (sizePrediction.confidence === "HIGH") {
        return { type: "size", reason: "SIZE has HIGH confidence" };
    }

    // If COLOR has HIGH confidence, use COLOR
    if (colorPrediction.confidence === "HIGH") {
        return { type: "color", reason: "COLOR has HIGH confidence" };
    }

    // Alternate between SIZE and COLOR for variety
    const shouldUseSize = Math.random() < 0.5;
    return {
        type: shouldUseSize ? "size" : "color",
        reason: shouldUseSize
            ? "Random selection - SIZE"
            : "Random selection - COLOR",
    };
}

/**
 * MAIN PREDICTION FUNCTION - Uses advanced pattern recognition
 */
const generateAdvancedPrediction = (historyData, lastResultInfo = null) => {
    if (!Array.isArray(historyData) || historyData.length < 3) {
        return null;
    }

    // Convert history to analysis format (oldest to newest)
    const analysisHistory = [...historyData].reverse().map((item) => ({
        period: item.issueNumber,
        color: getColor(parseInt(item.number)),
        size: getSize(parseInt(item.number)),
        number: parseInt(item.number),
    }));

    const lastWasLoss = lastResultInfo?.wasLoss || false;
    const previousType = lastResultInfo?.predictedType || null;

    const decision = decidePredictionType(
        analysisHistory,
        lastWasLoss,
        previousType,
    );
    let predictionResult;
    let predictedType;

    if (decision.type === "size") {
        predictionResult = getSizePrediction(analysisHistory);
        predictedType = "SIZE";
    } else {
        predictionResult = getColorPrediction(analysisHistory);
        predictedType = "COLOR";
    }

    if (!predictionResult.predict) {
        predictionResult = {
            predict: predictedType === "SIZE" ? "SMALL" : "RED",
            type: "DEFAULT",
            confidence: "LOW",
            reason: "Using default prediction",
        };
    }

    // Generate associated numbers based on prediction
    let associatedNumbers = [];
    if (predictedType === "COLOR") {
        if (predictionResult.predict === "RED") {
            associatedNumbers = [0, 2, 4, 6, 8];
        } else {
            associatedNumbers = [1, 3, 5, 7, 9];
        }
    } else {
        if (predictionResult.predict === "BIG") {
            associatedNumbers = [5, 6, 7, 8, 9];
        } else {
            associatedNumbers = [0, 1, 2, 3, 4];
        }
    }

    const nextPeriodBigInt = BigInt(historyData[0].issueNumber) + 1n;

    return {
        period: String(nextPeriodBigInt),
        mainPrediction: predictionResult.predict,
        associatedNumbers: associatedNumbers,
        type: predictedType,
        predictionMeta: {
            patternType: predictionResult.type,
            confidence: predictionResult.confidence,
            reason: predictionResult.reason,
            switchReason: decision.reason,
            dataPoints: analysisHistory.length,
        },
        outcome: null,
        actual: null,
    };
};

// A custom chart component to render the SVG based on history data
const WinGoChart = ({ history, getColorFromNumber }) => {
    const chartRef = useRef(null);
    const [chartWidth, setChartWidth] = useState(0);

    useEffect(() => {
        const updateWidth = () => {
            if (chartRef.current) {
                setChartWidth(chartRef.current.offsetWidth);
            }
        };
        updateWidth();
        window.addEventListener("resize", updateWidth);
        return () => window.removeEventListener("resize", updateWidth);
    }, []);

    const data = history;
    const padding = 1;
    const rowHeight = 40;
    const chartHeight = data.length * rowHeight + padding * 2;
    const numberPadding = 100;
    const numberWidth = (chartWidth - numberPadding - padding) / 10;
    const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    const getLineColor = (num) => {
        if (num === 0) return "#E94646";
        if (num === 5) return "#00A854";
        return getColorFromNumber(num) === "RED" ? "#E94646" : "#00A854";
    };

    return (
        <div ref={chartRef} style={{ width: "100%" }}>
            {chartWidth > 0 && (
                <svg width={chartWidth} height={chartHeight}>
                    {data.map((item, index) => {
                        const yPos = padding + index * rowHeight;
                        const resultNumber = parseInt(item.number);
                        const previousResult = data[index - 1]
                            ? parseInt(data[index - 1].number)
                            : null;

                        return (
                            <g key={item.issueNumber}>
                                <text
                                    x={padding}
                                    y={yPos + rowHeight / 2}
                                    textAnchor="start"
                                    alignmentBaseline="middle"
                                    fill="#243C65"
                                    fontSize="10"
                                    fontWeight="bold"
                                >
                                    {item.issueNumber}
                                </text>

                                {previousResult !== null && (
                                    <line
                                        x1={
                                            numberPadding +
                                            previousResult * numberWidth +
                                            numberWidth / 2
                                        }
                                        y1={yPos - rowHeight / 2}
                                        x2={
                                            numberPadding +
                                            resultNumber * numberWidth +
                                            numberWidth / 2
                                        }
                                        y2={yPos + rowHeight / 2}
                                        stroke="#2196F3"
                                        strokeWidth="0.8"
                                    />
                                )}

                                {numbers.map((num, i) => {
                                    const xPos =
                                        numberPadding +
                                        i * numberWidth +
                                        numberWidth / 2;
                                    const isResult = num === resultNumber;
                                    const circleFill = isResult
                                        ? getLineColor(num)
                                        : "transparent";
                                    const circleStroke = isResult
                                        ? getLineColor(num)
                                        : "#ccc";
                                    const textColor = isResult
                                        ? "#fff"
                                        : "#243C65";

                                    return (
                                        <g key={i}>
                                            <circle
                                                cx={xPos}
                                                cy={yPos + rowHeight / 2}
                                                r="8"
                                                fill={circleFill}
                                                stroke={circleStroke}
                                                strokeWidth="1"
                                                opacity={isResult ? 1 : 0.6}
                                            />
                                            <text
                                                x={xPos}
                                                y={yPos + rowHeight / 2 + 1}
                                                textAnchor="middle"
                                                alignmentBaseline="middle"
                                                fill={textColor}
                                                fontSize="10"
                                                fontWeight="bold"
                                            >
                                                {num}
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}
                </svg>
            )}
        </div>
    );
};

// Custom popup component for win/loss message
const PredictionGlassPopup = ({
    period,
    prediction,
    actualResult,
    resultType,
    patternInfo,
    onClose,
}) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 3000);

        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className="glass-popup-overlay">
            <div className="glass-popup">
                <h2>Game Result</h2>
                <p>
                    <strong>Period Number:</strong> {period}
                </p>
                <p>
                    <strong>Your Prediction:</strong> {prediction}
                </p>
                <p>
                    <strong>Actual Result:</strong> {actualResult}
                </p>
                {patternInfo && (
                    <p className="pattern-info">
                        <strong>Pattern:</strong> {patternInfo}
                    </p>
                )}
                <div className={`result-status ${resultType}`}>
                    {resultType.toUpperCase()}
                </div>
            </div>
        </div>
    );
};

const OneMinWingo = () => {
    const [latestPeriod, setLatestPeriod] = useState("");
    const [history, setHistory] = useState([]);
    const [error, setError] = useState(null);
    const [secondsLeft, setSecondsLeft] = useState(59);
    const [aiPredictionDisplay, setAiPredictionDisplay] = useState(null);
    const [isFadingOut, setIsFadingOut] = useState(false);
    const [isShaking, setIsShaking] = useState(false);
    const [lastPrediction, setLastPrediction] = useState(null);
    const [activeView, setActiveView] = useState("chart");
    const [predictionRecords, setPredictionRecords] = useState([]);
    const [popupData, setPopupData] = useState(null);
    const [lastResultInfo, setLastResultInfo] = useState(null);
    const navigate = useNavigate();

    const lastEvaluatedPeriodRef = useRef(null);

    const backToDashboard = () => {
        navigate(-1);
    };

    const getSizeFromNumber = useCallback((number) => {
        return number >= 5 ? "BIG" : "SMALL";
    }, []);

    const getColorFromNumber = useCallback((number) => {
        if (number === 0) return "RED";
        if (number === 5) return "GREEN";
        return number % 2 === 0 ? "RED" : "GREEN";
    }, []);

    // Updated prediction handler using advanced logic
    const handleAdvancedPredict = () => {
        if (!history || history.length < 3) {
            setAiPredictionDisplay(null);
            return;
        }

        const prediction = generateAdvancedPrediction(history, lastResultInfo);

        if (prediction) {
            setAiPredictionDisplay(prediction);
            setLastPrediction({
                period: prediction.period,
                mainPrediction: prediction.mainPrediction,
                type: prediction.type,
                predictedType: prediction.type === "COLOR" ? "color" : "size",
            });
        } else {
            setAiPredictionDisplay(null);
        }
        setIsFadingOut(false);
    };

    const handleCopyPrediction = async () => {
        if (aiPredictionDisplay) {
            const nextPeriod = aiPredictionDisplay.period;
            const predictionText = aiPredictionDisplay.mainPrediction;
            const predictedNumbersText =
                aiPredictionDisplay.associatedNumbers.join(", ");
            const patternType =
                aiPredictionDisplay.predictionMeta?.patternType || "ANALYSIS";
            const confidence =
                aiPredictionDisplay.predictionMeta?.confidence || "MEDIUM";

            const textToCopy = `
╭⚬──────────────────⚬╮
│ 🎯 WINGO  : 1 Min WinGo
│ ⏳ PERIOD  : ${nextPeriod}
│ 🔮 PREDICTION : ${predictionText} (${aiPredictionDisplay.type})
│ 🔢 NUMBERS  : ${predictedNumbersText}
│ 📊 PATTERN  : ${patternType} (${confidence} confidence)
╰⚬──────────────────⚬╯
`;
            try {
                await navigator.clipboard.writeText(textToCopy);
                alert("Prediction copied to clipboard!");
            } catch (err) {
                console.error("Failed to copy text: ", err);
                alert("Failed to copy prediction.");
            }
        }
    };

    const handleResult = useCallback(
        (period, prediction, actualResult, resultType, patternInfo) => {
            setPopupData({
                period,
                prediction,
                actualResult,
                resultType,
                patternInfo,
            });

            setTimeout(() => {
                setPopupData(null);
            }, 3000);
        },
        [],
    );

    const fetchHistory = useCallback(
        async (isRetry = false) => {
            try {
                const list = await fetchOptimizedData();
                if (Array.isArray(list) && list.length > 0) {
                    const currentPeriod = list[0]?.issueNumber;
                    if (currentPeriod && currentPeriod !== latestPeriod) {
                        setLatestPeriod(currentPeriod);
                        setHistory(list);
                        setError(null);

                        if (
                            lastPrediction &&
                            lastEvaluatedPeriodRef.current !==
                                lastPrediction.period
                        ) {
                            lastEvaluatedPeriodRef.current =
                                lastPrediction.period;

                            const lastActualEntry = list.find(
                                (item) =>
                                    item.issueNumber === lastPrediction.period,
                            );
                            if (lastActualEntry) {
                                const lastActualNumber = parseInt(
                                    lastActualEntry.number,
                                );
                                const actualColor =
                                    getColorFromNumber(lastActualNumber);
                                const actualSize =
                                    getSizeFromNumber(lastActualNumber);

                                let isCorrect = false;
                                let actualResult = "";

                                if (lastPrediction.type === "COLOR") {
                                    isCorrect =
                                        lastPrediction.mainPrediction ===
                                        actualColor;
                                    actualResult = actualColor;
                                } else if (lastPrediction.type === "SIZE") {
                                    isCorrect =
                                        lastPrediction.mainPrediction ===
                                        actualSize;
                                    actualResult = actualSize;
                                }

                                // Update lastResultInfo for next prediction
                                setLastResultInfo({
                                    wasLoss: !isCorrect,
                                    predictedType:
                                        lastPrediction.predictedType ||
                                        (lastPrediction.type === "COLOR"
                                            ? "color"
                                            : "size"),
                                });

                                setPredictionRecords((prevRecords) => {
                                    const currentPrediction = {
                                        period: lastPrediction.period,
                                        prediction:
                                            lastPrediction.mainPrediction,
                                        type: lastPrediction.type,
                                        actualNumber: lastActualNumber,
                                        actualResult: actualResult,
                                        isWin: isCorrect,
                                    };

                                    handleResult(
                                        lastPrediction.period,
                                        lastPrediction.mainPrediction,
                                        actualResult,
                                        isCorrect ? "win" : "loss",
                                        null,
                                    );

                                    return [currentPrediction, ...prevRecords];
                                });
                            }
                        }
                    } else if (!isRetry) {
                        setTimeout(() => fetchHistory(true), 1000);
                    }
                } else {
                    throw new Error("Unexpected data format or empty list");
                }
            } catch (err) {
                setError("Failed to load data");
            }
        },
        [
            latestPeriod,
            lastPrediction,
            getColorFromNumber,
            getSizeFromNumber,
            handleResult,
        ],
    );

    const handleRefresh = () => {
        setIsShaking(true);
        fetchHistory();
        setAiPredictionDisplay(null);
        setLastPrediction(null);
        setLastResultInfo(null);
        setIsFadingOut(false);
        setPredictionRecords([]);
        setPopupData(null);
        setTimeout(() => {
            setIsShaking(false);
        }, 500);
    };

    useEffect(() => {
        if (secondsLeft === 2 && aiPredictionDisplay) {
            setIsFadingOut(true);
        }
    }, [secondsLeft, aiPredictionDisplay]);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = getISTTime();
            const seconds = now.getSeconds();
            const remainingSeconds = (59 - seconds + 60) % 60;
            setSecondsLeft(remainingSeconds);

            if (remainingSeconds === 59) {
                fetchHistory();
                setAiPredictionDisplay(null);
                setIsFadingOut(false);
            }
        }, 1000);

        fetchHistory();

        return () => clearInterval(interval);
    }, [fetchHistory]);

    const cardClassName = `wingo-result-card ${
        aiPredictionDisplay?.type === "COLOR"
            ? aiPredictionDisplay.mainPrediction?.toLowerCase()
            : aiPredictionDisplay?.type === "SIZE"
              ? aiPredictionDisplay.mainPrediction?.toLowerCase() === "small"
                  ? "bg-small"
                  : "bg-big"
              : ""
    } ${isFadingOut ? "is-fading-out" : ""}`.trim();

    return (
        <div className="one-min-wrapper">
            {popupData && (
                <PredictionGlassPopup
                    period={popupData.period}
                    prediction={popupData.prediction}
                    actualResult={popupData.actualResult}
                    resultType={popupData.resultType}
                    patternInfo={popupData.patternInfo}
                    onClose={() => setPopupData(null)}
                />
            )}
            <div className="Wingo-header">
                <img
                    src="back (1).png"
                    alt="back"
                    onClick={backToDashboard}
                    style={{ width: "20px", cursor: "pointer" }}
                />
                <h2>1 Minute WinGo Prediction</h2>
            </div>
            <div className="Topline"></div>
            <div className="timer-container">
                <div className="prediction-box-upper">
                    <p>Time remaining</p>
                    <div className="digital-timer-container">
                        <div className="timer-box">
                            {Math.floor(secondsLeft / 10)}
                        </div>
                        <div className="timer-box">{secondsLeft % 10}</div>
                    </div>
                    <p className="next-period-num">
                        {latestPeriod
                            ? String(BigInt(latestPeriod) + 1n)
                            : "-----"}
                    </p>
                </div>
            </div>

            {aiPredictionDisplay && (
                <div className={cardClassName}>
                    <div className="ai-prediction-card-header">
                        <div className="ai-prediction-card-indicator"></div>
                        <p className="wingo-period">
                            Period: {aiPredictionDisplay.period}
                        </p>
                        {aiPredictionDisplay.predictionMeta && (
                            <p className="pattern-badge">
                                {aiPredictionDisplay.predictionMeta.patternType}
                            </p>
                        )}
                    </div>
                    <h3 className="wingo-prediction-text">
                        {aiPredictionDisplay.mainPrediction}
                    </h3>
                    <p className="wingo-prediction-numbers">
                        {aiPredictionDisplay.associatedNumbers.join(", ")}
                    </p>
                    {aiPredictionDisplay.predictionMeta && (
                        <p className="prediction-reason">
                            {aiPredictionDisplay.predictionMeta.reason}
                        </p>
                    )}
                </div>
            )}

            {!aiPredictionDisplay && history.length >= 3 && (
                <div className="svg-frame">
                    <LoadingSpinner />
                </div>
            )}

            {history.length < 3 && (
                <div className="waiting-data">
                    <p>Loading historical data... ({history.length}/3)</p>
                </div>
            )}

            {error && (
                <p style={{ color: "red", textAlign: "center" }}>{error}</p>
            )}

            <div className="button-wrapper">
                <div className="prediction-control-box">
                    <button
                        onClick={handleAdvancedPredict}
                        className="ai-predict-btn"
                        disabled={history.length < 3}
                    >
                        AI PREDICT.X {history.length < 3 && "(Need 3+ results)"}
                    </button>
                </div>

                <div className="secondary-buttons">
                    <button
                        type="button"
                        onClick={handleRefresh}
                        className={`refresh-btn ${isShaking ? "shake" : ""}`}
                    >
                        <RefreshIcon className="refresh-svg" />
                        Refresh
                    </button>

                    {aiPredictionDisplay && (
                        <button
                            onClick={handleCopyPrediction}
                            className="copy-btn"
                            onBlur={(e) => e.currentTarget.blur()}
                        >
                            <span>PREDICTION</span>
                            <span>COPIED!</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="view-tabs">
                <button
                    onClick={() => setActiveView("chart")}
                    className={activeView === "chart" ? "active-tab" : ""}
                >
                    Chart
                </button>
                <button
                    onClick={() => setActiveView("history")}
                    className={activeView === "history" ? "active-tab" : ""}
                >
                    History
                </button>

                <button
                    onClick={() => setActiveView("prediction-history")}
                    className={
                        activeView === "prediction-history" ? "active-tab" : ""
                    }
                >
                    Prediction History
                </button>
            </div>

            {activeView === "chart" && (
                <div className="chart-container">
                    <WinGoChart
                        history={history}
                        getColorFromNumber={getColorFromNumber}
                    />
                </div>
            )}

            {activeView === "history" && (
                <div className="oneMintable-container">
                    <table className="oneMinhistory-table">
                        <thead>
                            <tr>
                                <th>Period</th>
                                <th>Number</th>
                                <th>Big/Small</th>
                                <th>Color</th>
                            </tr>
                        </thead>

                        <tbody>
                            {history.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="4"
                                        style={{ textAlign: "center" }}
                                    >
                                        Loading...
                                    </td>
                                </tr>
                            ) : (
                                history.map((item) => {
                                    const number = parseInt(item.number);
                                    return (
                                        <tr key={item.issueNumber}>
                                            <td>{item.issueNumber}</td>
                                            <td
                                                className={
                                                    number % 2 === 0
                                                        ? "number-even"
                                                        : "number-odd"
                                                }
                                            >
                                                {number}
                                            </td>
                                            <td>{getSizeFromNumber(number)}</td>
                                            <td>
                                                {number === 0 ? (
                                                    <>🔴🟣</>
                                                ) : number === 5 ? (
                                                    <>🟢🟣</>
                                                ) : getColorFromNumber(
                                                      number,
                                                  ) === "GREEN" ? (
                                                    <>🟢</>
                                                ) : (
                                                    <>🔴</>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeView === "prediction-history" && (
                <div className="tableResult-container">
                    <table className="historyResult-table">
                        <thead>
                            <tr>
                                <th>Period</th>
                                <th>Prediction</th>
                                <th>Result</th>
                                <th>Outcome</th>
                            </tr>
                        </thead>
                        <tbody>
                            {predictionRecords.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="4"
                                        style={{
                                            textAlign: "center",
                                            fontStyle: "italic",
                                            padding: "20px",
                                        }}
                                    >
                                        No prediction history yet. Click "AI
                                        PREDICT.X" to start.
                                    </td>
                                </tr>
                            ) : (
                                predictionRecords.map((record, index) => (
                                    <tr key={index}>
                                        <td>{record.period}</td>
                                        <td>
                                            {record.prediction} ({record.type})
                                        </td>
                                        <td>
                                            {record.actualNumber} (
                                            {record.actualResult})
                                        </td>
                                        <td
                                            className={
                                                record.isWin
                                                    ? "outcome-win"
                                                    : "outcome-loss"
                                            }
                                        >
                                            {record.isWin ? "WIN" : "LOSS"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default OneMinWingo;
