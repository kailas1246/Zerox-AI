import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Intro from "./Intro";
import Chat from "./Zeroxchat";
import Login from "./Login";


const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Intro />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/Login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
