import React from "react";
import {
    HashRouter as Router, // Changed from BrowserRouter to HashRouter
    Routes,
    Route,
    Navigate,
} from "react-router-dom";
import Dashboard from "./components/Dashboard";
import Register from "./components/RegisterForm";
import Login from "./components/LoginForm";
import OneMinWingo from "./components/1MinWingo/OneMin_Wingo";
import Tournament from "./components/Tournament/Tournament";
import Colorgame from "./components/ColorGames/Colorgame";
import ThirtySecWingo from "./components/30SecWingo/ThirtySecWingo";

function App() {
    return (
        <Router>
            <div className="App">
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/oneminwingo" element={<OneMinWingo />} />
                    <Route path="/tournament" element={<Tournament />} />
                    <Route path="/colorgames" element={<Colorgame />} />
                    <Route
                        path="/thirtysecwingo"
                        element={<ThirtySecWingo />}
                    />
                    <Route
                        path="*"
                        element={<Navigate to="/login" replace />}
                    />
                </Routes>
            </div>
        </Router>
    );
}

export default App;
