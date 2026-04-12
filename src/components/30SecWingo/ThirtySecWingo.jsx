/* global BigInt */

import React, { useEffect, useState, useCallback, useRef } from "react";
import "./ThirtySecWingo.css";
import { useNavigate } from "react-router-dom";
import { getISTTime, fetchThirtySecData } from "../../predictionLogic";

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
    };
};

const ThirtySecWingo = () => {
    const [latestPeriod, setLatestPeriod] = useState("");
    const [history, setHistory] = useState([]);
    const [error, setError] = useState(null);
    const [secondsLeft, setSecondsLeft] = useState(29);
    const [isResultClicked, setIsResultClicked] = useState(false);
    const [glowAnimationActive, setGlowAnimationActive] = useState(false);
    const [showCard, setShowCard] = useState(false);
    const [isFadingOut, setIsFadingOut] = useState(false);
    const [predictedResult, setPredictedResult] = useState(null);
    const [showCopyButton, setShowCopyButton] = useState(false);
    const [advancedPrediction, setAdvancedPrediction] = useState(null);
    const [lastPredictionInfo, setLastPredictionInfo] = useState(null);

    const scannerThingRef = useRef(null);
    const navigate = useNavigate();
    const timeoutRef = useRef(null);

    const backToDashboard = () => {
        navigate(-1);
    };

    const getSizeFromNumber = (number) => {
        if (number >= 5) {
            return "BIG";
        } else {
            return "SMALL";
        }
    };

    const getColorFromNumber = (number) => {
        if (number === 0) return "RED";
        if (number === 5) return "GREEN";
        return number % 2 === 0 ? "RED" : "GREEN";
    };

    const handleStopPrediction = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsResultClicked(false);
        setGlowAnimationActive(false);
        setShowCard(false);
        setIsFadingOut(false);
        setPredictedResult(null);
        setAdvancedPrediction(null);
        setShowCopyButton(false);
    };

    const handleAIButtonClick = () => {
        if (!isResultClicked && history.length >= 3) {
            setGlowAnimationActive(true);
            setIsResultClicked(true);
            setShowCard(false);
            setIsFadingOut(false);
            setShowCopyButton(false);

            const prediction = generateAdvancedPrediction(
                history,
                lastPredictionInfo,
            );

            if (prediction) {
                setAdvancedPrediction(prediction);
                setPredictedResult(prediction.mainPrediction);

                setLastPredictionInfo({
                    period: prediction.period,
                    predictedValue: prediction.mainPrediction,
                    predictedType:
                        prediction.type === "COLOR" ? "color" : "size",
                });
            } else {
                const fallbackPrediction =
                    history[0] &&
                    getColorFromNumber(parseInt(history[0].number)) === "RED"
                        ? "GREEN"
                        : "RED";
                setPredictedResult(fallbackPrediction);
            }

            const holdDuration = secondsLeft > 3 ? secondsLeft - 3 : 0;
            const animationDuration = holdDuration + 2;

            if (scannerThingRef.current) {
                scannerThingRef.current.style.setProperty(
                    "--glow-duration",
                    `${animationDuration}s`,
                );
            }

            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(() => {
                setShowCard(true);
                setShowCopyButton(true);
            }, 3000);

            timeoutRef.current = setTimeout(() => {
                handleStopPrediction();
            }, animationDuration * 1000);
        }
    };

    const handleCopyPrediction = async () => {
        if (predictedResult && latestPeriod) {
            const nextPeriod = String(BigInt(latestPeriod) + 1n);
            const shortPeriod = nextPeriod.slice(-3);
            const predictionText = predictedResult;

            const patternInfo = advancedPrediction?.predictionMeta
                ? ` | Pattern: ${advancedPrediction.predictionMeta.patternType} (${advancedPrediction.predictionMeta.confidence})`
                : "";

            const textToCopy = `
╭⚬──────────────────⚬╮
│ 🎯 WINGO      : 30 Sec WinGo
│ ⏳ PERIOD     : ${shortPeriod}
│ 🔮 PREDICTION : ${predictionText}
${patternInfo ? `│ 📊 ANALYSIS   :${patternInfo}` : ""}
╰⚬──────────────────⚬╯
`;

            try {
                await navigator.clipboard.writeText(textToCopy);
                alert("Prediction copied to clipboard!");
                handleStopPrediction();
            } catch (err) {
                console.error("Failed to copy: ", err);
                alert("Failed to copy prediction. Please try again.");
            }
        }
    };

    const fetchHistory = useCallback(
        async (isRetry = false) => {
            try {
                const list = await fetchThirtySecData();
                if (Array.isArray(list) && list.length > 0) {
                    const currentPeriod = list[0]?.issueNumber;
                    if (currentPeriod && currentPeriod !== latestPeriod) {
                        setLatestPeriod(currentPeriod);
                        setHistory(list);
                        setError(null);

                        if (lastPredictionInfo && lastPredictionInfo.period) {
                            const lastActualEntry = list.find(
                                (item) =>
                                    item.issueNumber ===
                                    lastPredictionInfo.period,
                            );
                            if (lastActualEntry) {
                                const actualNumber = parseInt(
                                    lastActualEntry.number,
                                );
                                const actualColor =
                                    getColorFromNumber(actualNumber);
                                const actualSize =
                                    getSizeFromNumber(actualNumber);

                                let wasCorrect = false;
                                if (
                                    lastPredictionInfo.predictedType === "color"
                                ) {
                                    wasCorrect =
                                        lastPredictionInfo.predictedValue ===
                                        actualColor;
                                } else if (
                                    lastPredictionInfo.predictedType === "size"
                                ) {
                                    wasCorrect =
                                        lastPredictionInfo.predictedValue ===
                                        actualSize;
                                }

                                setLastPredictionInfo((prev) => ({
                                    ...prev,
                                    wasLoss: !wasCorrect,
                                    actualValue:
                                        lastPredictionInfo.predictedType ===
                                        "color"
                                            ? actualColor
                                            : actualSize,
                                }));
                            }
                        }
                    } else if (!isRetry) {
                        setTimeout(() => fetchHistory(true), 1000);
                    }
                } else {
                    throw new Error("Unexpected data format or empty list");
                }
            } catch (err) {
                console.error("Fetch error:", err);
                setError("Failed to load data");
            }
        },
        [latestPeriod, lastPredictionInfo],
    );

    useEffect(() => {
        const interval = setInterval(() => {
            const now = getISTTime();
            const seconds = now.getSeconds();
            const remainingSeconds = 29 - (seconds % 30);
            setSecondsLeft(remainingSeconds);

            if (remainingSeconds === 29) {
                fetchHistory();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [fetchHistory]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    useEffect(() => {
        if (secondsLeft <= 2 && showCard) {
            setIsFadingOut(true);
            setTimeout(() => {
                handleStopPrediction();
            }, 1000);
        }
    }, [secondsLeft, showCard]);

    return (
        <div className="one-min-wrapper">
            <div className="Wingo-header">
                <img
                    src="back (1).png"
                    alt="back"
                    onClick={backToDashboard}
                    style={{ width: "20px", cursor: "pointer" }}
                />
                <h2>30 Second WinGo Prediction</h2>
            </div>
            <div className="Topline"></div>

            {advancedPrediction &&
                advancedPrediction.predictionMeta &&
                showCard && (
                    <div className="advanced-prediction-info">
                        <div className="pattern-badge">
                            {advancedPrediction.predictionMeta.patternType}
                        </div>
                        <div className="confidence-badge">
                            Confidence:{" "}
                            {advancedPrediction.predictionMeta.confidence}
                        </div>
                        <div className="reason-text">
                            {advancedPrediction.predictionMeta.reason}
                        </div>
                    </div>
                )}

            <div className="thirtySecprediction-box">
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

            {history.length < 3 && (
                <div className="data-status-warning">
                    ⚠️ Need {3 - history.length} more results for AI prediction
                </div>
            )}

            <div className="button-wrapper">
                <div className="prediction-control-box">
                    <button
                        onClick={handleAIButtonClick}
                        className="predict-btn get-result-btn"
                        disabled={isResultClicked || history.length < 3}
                    >
                        {isResultClicked
                            ? "Scanning..."
                            : history.length < 3
                              ? `Need ${3 - history.length} more results`
                              : "AI Predict.X"}
                    </button>
                </div>
            </div>

            <div className={`loader ${isResultClicked ? "active" : ""}`}>
                <div className="eva">
                    <div className="head">
                        <div className="eyeChamber">
                            <div className="eye"></div>
                            <div className="eye"></div>
                        </div>
                    </div>
                    <div className="body">
                        <div className="hand"></div>
                        <div className="hand"></div>
                        <div
                            ref={scannerThingRef}
                            className={`scannerThing ${
                                glowAnimationActive ? "animate-glow" : ""
                            }`}
                        ></div>
                        <div className="scannerOrigin"></div>
                    </div>
                </div>
            </div>

            {showCard && predictedResult && (
                <div
                    className={`wingo-outer ${
                        isFadingOut ? "fade-out" : "fade-in"
                    }`}
                >
                    <div
                        className={`wingo-dot ${
                            predictedResult === "RED" ||
                            predictedResult === "GREEN"
                                ? predictedResult.toLowerCase()
                                : predictedResult === "BIG" ||
                                    predictedResult === "SMALL"
                                  ? predictedResult.toLowerCase()
                                  : ""
                        }`}
                    ></div>
                    <div className="wingo-card">
                        <div className="wingo-ray"></div>
                        <div className="wingo-text-number">
                            {latestPeriod
                                ? String(BigInt(latestPeriod) + 1n)
                                : ""}
                        </div>
                        <div
                            className={`wingo-text-color-size ${
                                predictedResult === "RED" ||
                                predictedResult === "GREEN"
                                    ? predictedResult.toLowerCase()
                                    : predictedResult === "BIG" ||
                                        predictedResult === "SMALL"
                                      ? predictedResult.toLowerCase()
                                      : ""
                            }`}
                        >
                            {predictedResult}
                        </div>
                        {advancedPrediction?.associatedNumbers && (
                            <div className="associated-numbers">
                                {advancedPrediction.associatedNumbers.join(
                                    ", ",
                                )}
                            </div>
                        )}
                        <div className="wingo-line wingo-topl"></div>
                        <div className="wingo-line wingo-leftl"></div>
                        <div className="wingo-line wingo-bottoml"></div>
                        <div className="wingo-line wingo-rightl"></div>
                    </div>
                </div>
            )}

            {showCopyButton && (
                <div className="copy-stop-button-container">
                    <button
                        className={`copy-prediction-btn ${
                            isFadingOut ? "fade-out" : "fade-in"
                        }`}
                        onClick={handleCopyPrediction}
                    >
                        Copy Prediction
                    </button>
                    <button
                        className={`stop-prediction-btn ${
                            isFadingOut ? "fade-out" : "fade-in"
                        }`}
                        onClick={handleStopPrediction}
                    >
                        Stop Prediction
                    </button>
                </div>
            )}

            {error && (
                <p style={{ color: "red", textAlign: "center" }}>{error}</p>
            )}

            {history.length === 0 ? (
                <table className="thirtySechistory-table">
                    <tbody>
                        <tr>
                            <td colSpan="4" style={{ textAlign: "center" }}>
                                Loading...
                            </td>
                        </tr>
                    </tbody>
                </table>
            ) : (
                <table className="history-table">
                    <thead>
                        <tr>
                            <th>Period</th>
                            <th>Number</th>
                            <th>Big/Small</th>
                            <th>Color</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map((item) => {
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
                                        ) : getColorFromNumber(number) ===
                                          "GREEN" ? (
                                            <>🟢</>
                                        ) : (
                                            <>🔴</>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default ThirtySecWingo;
