/* global BigInt */

import React, { useEffect, useState, useCallback, useRef } from "react";
import "./OneMinWingo.css";
import { useNavigate } from "react-router-dom";
import { fetchOptimizedData } from "../../predictionLogic";
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
 * Calculate entropy/variance of a data set
 */
const calculateEntropy = (arr) => {
    if (arr.length === 0) return 0;
    const freq = {};
    for (let item of arr) {
        freq[item] = (freq[item] || 0) + 1;
    }
    let entropy = 0;
    for (let key in freq) {
        const p = freq[key] / arr.length;
        entropy -= p * Math.log2(p);
    }
    return entropy;
};

/**
 * Detect pattern type in the data
 */
const detectPatternType = (dataArray) => {
    if (dataArray.length < 4) return "INSUFFICIENT_DATA";

    let isAlternating = true;
    for (let i = 0; i < dataArray.length - 1; i++) {
        if (dataArray[i] === dataArray[i + 1]) {
            isAlternating = false;
            break;
        }
    }
    if (isAlternating) return "PERFECT_ALTERNATION";

    let streak = 1;
    let maxStreak = 1;
    for (let i = 0; i < dataArray.length - 1; i++) {
        if (dataArray[i] === dataArray[i + 1]) {
            streak++;
            maxStreak = Math.max(maxStreak, streak);
        } else {
            streak = 1;
        }
    }
    if (maxStreak >= 4) return "DRAGON_STREAK";
    if (maxStreak === 3) return "MINI_STREAK";

    const entropy = calculateEntropy(dataArray);
    if (entropy > 1.5) return "HIGH_ENTROPY";
    if (entropy > 1.0) return "MEDIUM_ENTROPY";

    return "PATTERN_DETECTED";
};

/**
 * Get valid numbers based on prediction type
 */
const getValidNumbersForPrediction = (
    predictionType,
    predictedValue,
    hotNumbers = [],
    numbersNotInTable = [],
) => {
    let validNumbers = [];

    if (predictionType === "COLOR") {
        // RED: even numbers 0,2,4,6,8
        // GREEN: odd numbers 1,3,5,7,9
        if (predictedValue === "RED") {
            validNumbers = [0, 2, 4, 6, 8];
        } else {
            validNumbers = [1, 3, 5, 7, 9];
        }
    } else {
        // SIZE: SMALL: 0-4, BIG: 5-9
        if (predictedValue === "SMALL") {
            validNumbers = [0, 1, 2, 3, 4];
        } else {
            validNumbers = [5, 6, 7, 8, 9];
        }
    }

    // Select primary number (prefer hot number from valid range)
    const hotInRange = validNumbers.filter((n) => hotNumbers.includes(n));
    let primaryNumber;

    if (hotInRange.length > 0) {
        primaryNumber =
            hotInRange[Math.floor(Math.random() * hotInRange.length)];
    } else {
        primaryNumber =
            validNumbers[Math.floor(Math.random() * validNumbers.length)];
    }

    // Select secondary number (prefer cold number from valid range, different from primary)
    let coldInRange = validNumbers.filter(
        (n) => numbersNotInTable.includes(n) && n !== primaryNumber,
    );
    let secondaryNumber;

    if (coldInRange.length > 0) {
        secondaryNumber =
            coldInRange[Math.floor(Math.random() * coldInRange.length)];
    } else {
        // If no cold numbers in range, pick any other number from valid range
        const otherNumbers = validNumbers.filter((n) => n !== primaryNumber);
        if (otherNumbers.length > 0) {
            secondaryNumber =
                otherNumbers[Math.floor(Math.random() * otherNumbers.length)];
        } else {
            secondaryNumber =
                primaryNumber === validNumbers[0]
                    ? validNumbers[1]
                    : validNumbers[0];
        }
    }

    return { primaryNumber, secondaryNumber };
};

let lastPredictionType = null;

const getBalancedPrediction = (historyArray) => {
    if (historyArray.length < 5) {
        return {
            prediction: "WAIT",
            numbers: [0, 1],
            predictionType: "WAIT",
            confidence: "LOW",
            reason: "Need at least 5 results for analysis",
            patternType: "INSUFFICIENT_DATA",
        };
    }

    const numbers = historyArray.map((r) => parseInt(r.number));
    const colors = historyArray.map((r) => getColor(parseInt(r.number)));
    const sizes = historyArray.map((r) => getSize(parseInt(r.number)));

    const numberPattern = detectPatternType(numbers.slice(0, 10));

    const recentNumbers = numbers.slice(0, 10);
    const numberFrequency = {};
    recentNumbers.forEach((n) => {
        numberFrequency[n] = (numberFrequency[n] || 0) + 1;
    });

    const numbersInTable = [...new Set(recentNumbers)];
    const allNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const numbersNotInTable = allNumbers.filter(
        (n) => !numbersInTable.includes(n),
    );

    const hotNumbers = Object.entries(numberFrequency)
        .filter(([_, count]) => count >= 2)
        .map(([num]) => parseInt(num));

    const entropy = calculateEntropy(recentNumbers);
    const lastThreeColors = colors.slice(0, 3);
    const lastColor = colors[0];
    const lastSize = sizes[0];

    // DECIDE PREDICTION TYPE - Alternate between COLOR and SIZE
    let currentPredictionType;

    if (lastPredictionType === "COLOR") {
        currentPredictionType = "SIZE";
    } else if (lastPredictionType === "SIZE") {
        currentPredictionType = "COLOR";
    } else {
        const redCount = colors.slice(0, 8).filter((c) => c === "RED").length;
        const greenCount = colors
            .slice(0, 8)
            .filter((c) => c === "GREEN").length;
        const bigCount = sizes.slice(0, 8).filter((s) => s === "BIG").length;
        const smallCount = sizes
            .slice(0, 8)
            .filter((s) => s === "SMALL").length;

        const colorImbalance = Math.abs(redCount - greenCount);
        const sizeImbalance = Math.abs(bigCount - smallCount);

        if (colorImbalance > sizeImbalance) {
            currentPredictionType = "COLOR";
        } else if (sizeImbalance > colorImbalance) {
            currentPredictionType = "SIZE";
        } else {
            currentPredictionType = Math.random() < 0.5 ? "COLOR" : "SIZE";
        }
    }

    let predictedValue = "";
    let reason = "";
    let patternType = "";
    let confidence = "MEDIUM";

    if (currentPredictionType === "COLOR") {
        // COLOR PREDICTION LOGIC
        if (numberPattern === "DRAGON_STREAK") {
            predictedValue = lastColor;
            const streakCount =
                numbers
                    .slice(0, 6)
                    .filter((n, i, arr) => i > 0 && arr[i] === arr[i - 1])
                    .length + 1;
            reason = `🐉 DRAGON: ${lastColor} x${streakCount} → CONTINUE`;
            patternType = "DRAGON_CONTINUE";
            confidence = "HIGH";
        } else if (numberPattern === "PERFECT_ALTERNATION") {
            const secondLast = colors[1];
            predictedValue = secondLast === "RED" ? "GREEN" : "RED";
            reason = "🪞 MIRROR: Perfect alternation → BREAK";
            patternType = "MIRROR_BREAK";
            confidence = "HIGH";
        } else if (numberPattern === "HIGH_ENTROPY" || entropy > 1.4) {
            predictedValue = lastColor === "RED" ? "GREEN" : "RED";
            reason = `🎲 HIGH ENTROPY (${entropy.toFixed(2)}) → Opposite color`;
            patternType = "UNPREDICTABLE";
            confidence = "LOW";
        } else if (numberPattern === "MINI_STREAK") {
            predictedValue = lastColor;
            reason = `🐉 MINI STREAK (3x) → Continue ${lastColor}`;
            patternType = "MINI_STREAK";
            confidence = "MEDIUM_HIGH";
        } else if (numberPattern === "MEDIUM_ENTROPY") {
            const lastTwoSame = lastThreeColors[0] === lastThreeColors[1];
            if (lastTwoSame) {
                predictedValue = lastColor === "RED" ? "GREEN" : "RED";
                reason = `🔄 REVERSAL: Two ${lastColor}s → ${predictedValue}`;
            } else {
                const redCount = colors
                    .slice(0, 8)
                    .filter((c) => c === "RED").length;
                const greenCount = colors
                    .slice(0, 8)
                    .filter((c) => c === "GREEN").length;
                if (redCount >= 6) {
                    predictedValue = "GREEN";
                    reason = `⚖️ CORRECTION: RED overload (${redCount}/8) → GREEN`;
                } else if (greenCount >= 6) {
                    predictedValue = "RED";
                    reason = `⚖️ CORRECTION: GREEN overload (${greenCount}/8) → RED`;
                } else {
                    predictedValue = lastColor === "RED" ? "GREEN" : "RED";
                    reason = `🔄 Opposite of last (${lastColor})`;
                }
            }
            patternType = "MEDIUM_ENTROPY";
            confidence = "MEDIUM";
        } else {
            const redCount = colors
                .slice(0, 8)
                .filter((c) => c === "RED").length;
            const greenCount = colors
                .slice(0, 8)
                .filter((c) => c === "GREEN").length;
            if (redCount >= 6) {
                predictedValue = "GREEN";
                reason = `⚖️ RED overload (${redCount}/8) → GREEN`;
            } else if (greenCount >= 6) {
                predictedValue = "RED";
                reason = `⚖️ GREEN overload (${greenCount}/8) → RED`;
            } else {
                predictedValue = lastColor === "RED" ? "GREEN" : "RED";
                reason = `🔄 Opposite of last result`;
            }
            patternType = "CORRECTION";
            confidence = "MEDIUM";
        }
    } else {
        // SIZE PREDICTION LOGIC
        if (numberPattern === "DRAGON_STREAK") {
            predictedValue = lastSize;
            const streakCount =
                numbers
                    .slice(0, 6)
                    .filter((n, i, arr) => i > 0 && arr[i] === arr[i - 1])
                    .length + 1;
            reason = `🐉 DRAGON: ${lastSize} x${streakCount} → CONTINUE`;
            patternType = "DRAGON_CONTINUE";
            confidence = "HIGH";
        } else if (numberPattern === "PERFECT_ALTERNATION") {
            const secondLastSize = sizes[1];
            predictedValue = secondLastSize === "SMALL" ? "BIG" : "SMALL";
            reason = "🪞 MIRROR: Perfect alternation → BREAK";
            patternType = "MIRROR_BREAK";
            confidence = "HIGH";
        } else if (numberPattern === "HIGH_ENTROPY" || entropy > 1.4) {
            predictedValue = lastSize === "BIG" ? "SMALL" : "BIG";
            reason = `🎲 HIGH ENTROPY (${entropy.toFixed(2)}) → Opposite size`;
            patternType = "UNPREDICTABLE";
            confidence = "LOW";
        } else if (numberPattern === "MINI_STREAK") {
            predictedValue = lastSize;
            reason = `🐉 MINI STREAK (3x) → Continue ${lastSize}`;
            patternType = "MINI_STREAK";
            confidence = "MEDIUM_HIGH";
        } else if (numberPattern === "MEDIUM_ENTROPY") {
            const lastTwoSame = sizes.slice(0, 2)[0] === sizes.slice(0, 2)[1];
            if (lastTwoSame) {
                predictedValue = lastSize === "BIG" ? "SMALL" : "BIG";
                reason = `🔄 REVERSAL: Two ${lastSize}s → ${predictedValue}`;
            } else {
                const bigCount = sizes
                    .slice(0, 8)
                    .filter((s) => s === "BIG").length;
                const smallCount = sizes
                    .slice(0, 8)
                    .filter((s) => s === "SMALL").length;
                if (bigCount >= 6) {
                    predictedValue = "SMALL";
                    reason = `⚖️ BIG overload (${bigCount}/8) → SMALL`;
                } else if (smallCount >= 6) {
                    predictedValue = "BIG";
                    reason = `⚖️ SMALL overload (${smallCount}/8) → BIG`;
                } else {
                    predictedValue = lastSize === "BIG" ? "SMALL" : "BIG";
                    reason = `🔄 Opposite of last size`;
                }
            }
            patternType = "MEDIUM_ENTROPY";
            confidence = "MEDIUM";
        } else {
            const bigCount = sizes
                .slice(0, 8)
                .filter((s) => s === "BIG").length;
            const smallCount = sizes
                .slice(0, 8)
                .filter((s) => s === "SMALL").length;
            if (bigCount >= 6) {
                predictedValue = "SMALL";
                reason = `⚖️ BIG overload (${bigCount}/8) → SMALL`;
            } else if (smallCount >= 6) {
                predictedValue = "BIG";
                reason = `⚖️ SMALL overload (${smallCount}/8) → BIG`;
            } else {
                predictedValue = lastSize === "BIG" ? "SMALL" : "BIG";
                reason = `🔄 Opposite of last size`;
            }
            patternType = "CORRECTION";
            confidence = "MEDIUM";
        }
    }

    // Get valid numbers based on prediction type and value
    const { primaryNumber, secondaryNumber } = getValidNumbersForPrediction(
        currentPredictionType,
        predictedValue,
        hotNumbers,
        numbersNotInTable,
    );

    const predictionNumbers = [primaryNumber, secondaryNumber].sort(
        (a, b) => a - b,
    );

    // Format display
    let predictionDisplay = "";
    if (currentPredictionType === "COLOR") {
        predictionDisplay = predictedValue === "RED" ? "🔴 RED" : "🟢 GREEN";
    } else {
        predictionDisplay = predictedValue === "BIG" ? "📈 BIG" : "📉 SMALL";
    }

    lastPredictionType = currentPredictionType;

    return {
        prediction: predictionDisplay,
        predictedValue: predictedValue,
        predictionType: currentPredictionType,
        numbers: predictionNumbers,
        primaryNumber: primaryNumber,
        secondaryNumber: secondaryNumber,
        confidence: confidence,
        reason: reason,
        patternType: patternType,
        entropy: entropy.toFixed(2),
        numbersInTable: numbersInTable,
        numbersNotInTable: numbersNotInTable,
    };
};

/**
 * MAIN PREDICTION FUNCTION
 */
const generatePrediction = (historyData) => {
    if (!Array.isArray(historyData) || historyData.length < 5) {
        return null;
    }

    const predictionResult = getBalancedPrediction(historyData);

    if (!predictionResult.numbers || predictionResult.numbers.length === 0) {
        return null;
    }

    const nextPeriodBigInt = BigInt(historyData[0].issueNumber) + 1n;

    return {
        period: String(nextPeriodBigInt),
        mainPrediction: predictionResult.prediction,
        predictedValue: predictionResult.predictedValue,
        predictionType: predictionResult.predictionType,
        predictionNumbers: predictionResult.numbers,
        primaryNumber: predictionResult.primaryNumber,
        secondaryNumber: predictionResult.secondaryNumber,
        predictionMeta: {
            patternType: predictionResult.patternType,
            confidence: predictionResult.confidence,
            reason: predictionResult.reason,
            entropy: predictionResult.entropy,
            numbersInTable: predictionResult.numbersInTable,
            numbersNotInTable: predictionResult.numbersNotInTable,
            dataPoints: historyData.length,
        },
    };
};

// Chart Component
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
    const chartHeight = Math.min(data.length, 20) * rowHeight + padding * 2;
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
                    {data.slice(0, 20).map((item, index) => {
                        const yPos = padding + index * rowHeight;
                        const resultNumber = parseInt(item.number);
                        const previousResult = data[index + 1]
                            ? parseInt(data[index + 1].number)
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
                                        y1={yPos + rowHeight + rowHeight / 2}
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

// Popup component
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
                    <strong>Period:</strong> {period}
                </p>
                <p>
                    <strong>Prediction:</strong> {prediction}
                </p>
                <p>
                    <strong>Actual:</strong> {actualResult}
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

// Copy Icon Component
const CopyIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
);

const OneMinWingo = () => {
    const [latestPeriod, setLatestPeriod] = useState("");
    const [history, setHistory] = useState([]);
    const [error, setError] = useState(null);
    const [aiPredictionDisplay, setAiPredictionDisplay] = useState(null);
    const [isShaking, setIsShaking] = useState(false);
    const [lastPrediction, setLastPrediction] = useState(null);
    const [activeView, setActiveView] = useState("chart");
    const [predictionRecords, setPredictionRecords] = useState([]);
    const [popupData, setPopupData] = useState(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const navigate = useNavigate();

    const lastEvaluatedPeriodRef = useRef(null);

    const backToDashboard = () => navigate(-1);

    const getSizeFromNumber = useCallback(
        (number) => (number >= 5 ? "BIG" : "SMALL"),
        [],
    );
    const getColorFromNumber = useCallback((number) => {
        if (number === 0) return "RED";
        if (number === 5) return "GREEN";
        return number % 2 === 0 ? "RED" : "GREEN";
    }, []);

    const handlePredict = () => {
        if (!history || history.length < 5) {
            setAiPredictionDisplay(null);
            return;
        }

        const prediction = generatePrediction(history);

        if (prediction) {
            setAiPredictionDisplay(prediction);
            setLastPrediction({
                period: prediction.period,
                predictionNumbers: prediction.predictionNumbers,
                mainPrediction: prediction.mainPrediction,
                predictionType: prediction.predictionType,
            });
        } else {
            setAiPredictionDisplay(null);
        }
        setCopySuccess(false);
    };

    const handleCopyPrediction = async () => {
        if (aiPredictionDisplay) {
            // Get full period and take only last 3 digits
            const fullPeriod = aiPredictionDisplay.period;
            const shortPeriod = fullPeriod.slice(-3);

            const numbers = aiPredictionDisplay.predictionNumbers;
            let betText = "";

            if (aiPredictionDisplay.predictionType === "COLOR") {
                const color = aiPredictionDisplay.mainPrediction.includes("RED")
                    ? "RED"
                    : "GRN";
                betText = `${color} ${numbers[0]}&${numbers[1]}`;
            } else {
                const size = aiPredictionDisplay.mainPrediction.includes("BIG")
                    ? "BIG"
                    : "SML";
                betText = `${size} ${numbers[0]}&${numbers[1]}`;
            }

            const textToCopy = `
╭⚬───────────⚬╮
│ ⏳ PERIOD   : ${shortPeriod}
│ 🔮 BET      : ${betText}
╰⚬───────────⚬╯
`;
            try {
                await navigator.clipboard.writeText(textToCopy);
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000);
            } catch (err) {
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
            setTimeout(() => setPopupData(null), 3000);
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

                                const isCorrect =
                                    lastPrediction.predictionNumbers.includes(
                                        lastActualNumber,
                                    );
                                const actualResult = `${lastActualNumber} (${actualColor}/${actualSize})`;
                                const patternInfo =
                                    aiPredictionDisplay?.predictionMeta
                                        ?.reason || "Pattern analysis";

                                setPredictionRecords((prev) => [
                                    {
                                        period: lastPrediction.period,
                                        prediction:
                                            lastPrediction.mainPrediction,
                                        predictionType:
                                            lastPrediction.predictionType,
                                        predictionNumbers:
                                            lastPrediction.predictionNumbers,
                                        actualNumber: lastActualNumber,
                                        actualResult: actualResult,
                                        isWin: isCorrect,
                                    },
                                    ...prev,
                                ]);

                                handleResult(
                                    lastPrediction.period,
                                    lastPrediction.mainPrediction,
                                    actualResult,
                                    isCorrect ? "win" : "loss",
                                    patternInfo,
                                );
                            }
                        }
                    } else if (!isRetry) {
                        setTimeout(() => fetchHistory(true), 1000);
                    }
                } else {
                    throw new Error("Unexpected data format");
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
            aiPredictionDisplay,
        ],
    );

    const handleRefresh = () => {
        setIsShaking(true);
        fetchHistory();
        setAiPredictionDisplay(null);
        setLastPrediction(null);
        setPredictionRecords([]);
        setPopupData(null);
        setCopySuccess(false);
        setTimeout(() => setIsShaking(false), 500);
    };

    useEffect(() => {
        const interval = setInterval(() => fetchHistory(), 60000);
        fetchHistory();
        return () => clearInterval(interval);
    }, [fetchHistory]);

    const getPredictionCardClass = () => {
        if (!aiPredictionDisplay) return "wingo-result-card";
        let baseClass = "wingo-result-card";
        if (aiPredictionDisplay.mainPrediction.includes("🔴"))
            baseClass += " color-red";
        else if (aiPredictionDisplay.mainPrediction.includes("🟢"))
            baseClass += " color-green";
        else if (aiPredictionDisplay.mainPrediction.includes("📈"))
            baseClass += " bg-big";
        else if (aiPredictionDisplay.mainPrediction.includes("📉"))
            baseClass += " bg-small";
        return baseClass;
    };

    return (
        <div className="one-min-wrapper">
            {popupData && (
                <PredictionGlassPopup
                    {...popupData}
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

            {aiPredictionDisplay && (
                <div className={getPredictionCardClass()}>
                    <div className="ai-prediction-card-header">
                        <div className="ai-prediction-card-indicator"></div>
                        <p className="wingo-period">
                            Period: {aiPredictionDisplay.period}
                        </p>
                        {aiPredictionDisplay.predictionMeta && (
                            <>
                                <p className="pattern-badge">
                                    {aiPredictionDisplay.predictionMeta.patternType?.replace(
                                        /_/g,
                                        " ",
                                    )}
                                </p>
                                <p
                                    className={`confidence-badge ${aiPredictionDisplay.predictionMeta.confidence?.toLowerCase()}`}
                                >
                                    {
                                        aiPredictionDisplay.predictionMeta
                                            .confidence
                                    }
                                </p>
                            </>
                        )}
                    </div>
                    <h3 className="wingo-prediction-text">
                        {aiPredictionDisplay.mainPrediction}
                    </h3>
                    <p className="wingo-prediction-numbers">
                        🎯 {aiPredictionDisplay.predictionNumbers[0]} •{" "}
                        {aiPredictionDisplay.predictionNumbers[1]}
                    </p>
                    {aiPredictionDisplay.predictionMeta && (
                        <>
                            <p className="prediction-reason">
                                {aiPredictionDisplay.predictionMeta.reason}
                                {aiPredictionDisplay.predictionMeta.entropy &&
                                    ` | Entropy: ${aiPredictionDisplay.predictionMeta.entropy}`}
                            </p>
                            <p className="prediction-stats">
                                📊 Type: {aiPredictionDisplay.predictionType} |
                                🎲 Valid range:{" "}
                                {aiPredictionDisplay.predictionType === "COLOR"
                                    ? aiPredictionDisplay.mainPrediction.includes(
                                          "RED",
                                      )
                                        ? "Even (0,2,4,6,8)"
                                        : "Odd (1,3,5,7,9)"
                                    : aiPredictionDisplay.mainPrediction.includes(
                                            "BIG",
                                        )
                                      ? "5-9"
                                      : "0-4"}
                            </p>
                        </>
                    )}

                    <button
                        onClick={handleCopyPrediction}
                        className="copy-prediction-btn"
                    >
                        <CopyIcon /> {copySuccess ? "COPIED!" : "COPY"}
                    </button>
                </div>
            )}

            {!aiPredictionDisplay && history.length >= 5 && (
                <div className="svg-frame">
                    <LoadingSpinner />
                </div>
            )}

            {history.length < 5 && (
                <div className="waiting-data">
                    <p>Loading historical data... ({history.length}/5)</p>
                    <p className="waiting-hint">
                        Need 5+ results for accurate pattern analysis
                    </p>
                </div>
            )}

            {error && (
                <p style={{ color: "red", textAlign: "center" }}>{error}</p>
            )}

            <div className="button-wrapper">
                <div className="prediction-control-box">
                    <button
                        onClick={handlePredict}
                        className="ai-predict-btn"
                        disabled={history.length < 5}
                    >
                        🔮 ANALYZE & PREDICT{" "}
                        {history.length < 5 && "(Need 5+ results)"}
                    </button>
                </div>
                <div className="secondary-buttons">
                    <button
                        type="button"
                        onClick={handleRefresh}
                        className={`refresh-btn ${isShaking ? "shake" : ""}`}
                    >
                        <RefreshIcon className="refresh-svg" /> Refresh
                    </button>
                </div>
            </div>

            <div className="view-tabs">
                <button
                    onClick={() => setActiveView("chart")}
                    className={activeView === "chart" ? "active-tab" : ""}
                >
                    📊 Chart
                </button>
                <button
                    onClick={() => setActiveView("history")}
                    className={activeView === "history" ? "active-tab" : ""}
                >
                    📜 History
                </button>
                <button
                    onClick={() => setActiveView("prediction-history")}
                    className={
                        activeView === "prediction-history" ? "active-tab" : ""
                    }
                >
                    📈 Results
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
                                            {number === 0
                                                ? "🔴"
                                                : number === 5
                                                  ? "🟢"
                                                  : getColorFromNumber(
                                                          number,
                                                      ) === "GREEN"
                                                    ? "🟢"
                                                    : "🔴"}
                                        </td>
                                    </tr>
                                );
                            })}
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
                                <th>Numbers</th>
                                <th>Actual</th>
                                <th>Outcome</th>
                            </tr>
                        </thead>
                        <tbody>
                            {predictionRecords.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="5"
                                        style={{
                                            textAlign: "center",
                                            padding: "20px",
                                        }}
                                    >
                                        No prediction history yet. Click
                                        "ANALYZE & PREDICT" to start.
                                    </td>
                                </tr>
                            ) : (
                                predictionRecords.map((record, index) => (
                                    <tr key={index}>
                                        <td>{record.period}</td>
                                        <td>{record.prediction}</td>
                                        <td>
                                            {record.predictionNumbers?.join(
                                                " & ",
                                            )}
                                        </td>
                                        <td>{record.actualResult}</td>
                                        <td
                                            className={
                                                record.isWin
                                                    ? "outcome-win"
                                                    : "outcome-loss"
                                            }
                                        >
                                            {record.isWin
                                                ? "✅ WIN"
                                                : "❌ LOSS"}
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
