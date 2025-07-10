
import { useEffect, useRef, useState } from "react";
import Message from "../Message/Message";

export default function ChatWindow() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loadingStage, setLoadingStage] = useState("");
  const [debugLogs, setDebugLogs] = useState([]);
  const [isDebugDrawerOpen, setIsDebugDrawerOpen] = useState(false);

  const bottomRef = useRef(null);
  const debugBottomRef = useRef(null);

  const Token = "Bearer your PAT here"; // your token

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (debugBottomRef.current) {
      debugBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [debugLogs]);

  const formatTime = () => new Date().toLocaleString();

  // Log debug with headers, body, output
  const logDebug = (stage, url, headers, body, output) => {
    setDebugLogs((prev) => [
      ...prev,
      {
        stage,
        url,
        headers,
        body,
        output,
        time: formatTime(),
      },
    ]);
  };

  const sendToFourthAPI = async (cleanedResult) => {
    const url =
      "https://Account.snowflakecomputing.com/api/v2/cortex/inference:complete";

    const prompt = `This is my SQL query output. Write a data analysis summary of the results in plain English for business users in less than three lines:\n\n${JSON.stringify(
      cleanedResult,
      null,
      2
    )}`;

    const headers = {
      Authorization: Token,
      "Content-Type": "application/json",
      Accept: "text/event-stream", // important for streaming
    };

    const body = {
      model: "mistral-large2", // or llama4-maverick etc.
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 1024,
      stream: true, //  enable streaming
    };

    try {
      setLoadingStage("fourth");

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let fullMessage = "";
      let partialMessageId = `stream-${Date.now()}`;

      // Add a placeholder message (which we will update)
      setMessages((prev) => [
        ...prev,
        {
          id: partialMessageId,
          text: "",
          isUser: false,
          time: formatTime(),
        },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Split on newlines (in case multiple chunks in one packet)
        const lines = chunk
          .split("\n")
          .filter((line) => line.startsWith("data: "));

        for (const line of lines) {
          try {
            const json = JSON.parse(line.replace(/^data:\s*/, ""));
            const delta = json?.choices?.[0]?.delta?.content;

            if (delta) {
              fullMessage += delta;

              // Update the partial message in state
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === partialMessageId
                    ? { ...msg, text: fullMessage }
                    : msg
                )
              );
            }
          } catch (e) {
            console.warn("Invalid stream JSON:", e);
          }
        }
      }

      logDebug("Fourth API (Streamed)", url, headers, body, fullMessage);
    } catch (error) {
      logDebug("Fourth API Error", url, headers, body, error.message);
      setMessages((prev) => [
        ...prev,
        {
          text: `Error in fourth API: ${error.message}`,
          isUser: false,
          time: formatTime(),
        },
      ]);
    } finally {
      setLoadingStage("");
    }
  };

  const sendToThirdAPI = async (statusUrl, requestId) => {
    const url = `https://Account.snowflakecomputing.com/${statusUrl}`;
    const headers = { Authorization: Token };
    const body = null;

    try {
      setLoadingStage("secondThird");

      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      const result = await response.json();

      // Remove some metadata fields, keep the rest
      const {
        code,
        sqlState,
        statementHandle,
        statementStatusUrl,
        message,
        requestId: _,
        createdOn,
        ...cleanedResult
      } = result;

      logDebug("Third API", url, headers, body, cleanedResult);

      // Store cleanedResult (the full result object) in message for table rendering
      setMessages((prev) => [
        ...prev,
        {
          tableData: cleanedResult,
          isUser: false,
          time: formatTime(),
        },
      ]);
      await sendToFourthAPI(cleanedResult);
    } catch (error) {
      logDebug("Third API Error", url, headers, body, error.message);
      setMessages((prev) => [
        ...prev,
        {
          text: `Error in final result: ${error.message}`,
          isUser: false,
          time: formatTime(),
        },
      ]);
    } finally {
      setLoadingStage("");
    }
  };

  const sendToSecondAPI = async (sqlStatement) => {
    const url = "https://Account.snowflakecomputing.com/api/v2/statements";
    const headers = {
      "Content-Type": "application/json",
      Authorization: Token,
    };
    const body = {
      statement: sqlStatement,
      timeout: 10,
      database: "CORTEX_ANALYST_DEMO",
      schema: "REVENUE_TIMESERIES",
      warehouse: "COMPUTE_WH",
      role: "ACCOUNTADMIN",
    };

    try {
      setLoadingStage("secondThird");

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const result = await response.json();
      logDebug("Second API", url, headers, body, result);

      const { statementStatusUrl, requestId } = result;

      if (statementStatusUrl && requestId) {
        await sendToThirdAPI(statementStatusUrl, requestId);
      } else {
        throw new Error("Missing statementStatusUrl or requestId");
      }
    } catch (error) {
      logDebug("Second API Error", url, headers, body, error.message);
      setMessages((prev) => [
        ...prev,
        {
          text: `Error in second API: ${error.message}`,
          isUser: false,
          time: formatTime(),
        },
      ]);
      setLoadingStage("");
    }
  };

  const sendToSnowflake = async (text) => {
    const url =
      "https://Account.snowflakecomputing.com/api/v2/cortex/analyst/message";
    const headers = {
      "Content-Type": "application/json",
      Authorization: Token,
    };
    const body = {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text }],
        },
      ],
      semantic_model_file:
        "@CORTEX_ANALYST_DEMO.REVENUE_TIMESERIES.RAW_DATA/revenue_timeseries.yaml",
      warehouse: "COMPUTE_WH",
      operation: "sql_generation",
      strem: false,
    };

    try {
      setLoadingStage("first");

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const data = await response.json();
      logDebug("First API", url, headers, body, data);

      const content = data?.message?.content || [];
      let sqlStatement = "";

      for (const item of content) {
        if (item.type === "text") {
          setMessages((prev) => [
            ...prev,
            {
              text: item.text,
              isUser: false,
              time: formatTime(),
            },
          ]);
        } else if (item.type === "sql") {
          sqlStatement = item.statement;
        }
      }

      if (sqlStatement) {
        await sendToSecondAPI(sqlStatement);
      } else {
        setLoadingStage("");
      }
    } catch (error) {
      logDebug("First API Error", url, headers, body, error.message);
      setMessages((prev) => [
        ...prev,
        {
          text: `Error in first API: ${error.message}`,
          isUser: false,
          time: formatTime(),
        },
      ]);
      setLoadingStage("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = {
      text: input,
      isUser: true,
      time: formatTime(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    await sendToSnowflake(input);
  };

  // New Component: SnowflakeResultTable to render Snowflake result object
  function SnowflakeResultTable({ result }) {
    if (
      !result ||
      !result.resultSetMetaData ||
      !result.resultSetMetaData.rowType ||
      !result.data
    )
      return null;

    const columns = result.resultSetMetaData.rowType.map((col) => col.name);
    const rows = result.data; // array of arrays

    return (
      <table className="border border-gray-300 w-full text-sm table-auto">
        <thead className="bg-gray-100">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="border border-gray-300 px-2 py-1 text-left"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              {row.map((cell, i) => (
                <td key={i} className="border border-gray-300 px-2 py-1">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const handleClearChat = () => {
    setMessages([]);
    setInput("");
    setDebugLogs([]);
  };

  return (
    <div className="flex flex-col h-screen w-[80%] mx-auto bg-white text-black shadow-md relative">
      {/* Debug Button */}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, i) => (
          <div key={i} className="space-y-1">
            <div
              className={`text-base ${
                msg.isUser
                  ? "text-right text-gray-400"
                  : "text-left text-gray-500"
              }`}
            >
              {msg.time}
            </div>

            {msg.tableData ? (
              <div className="p-2 rounded-xl max-w-full overflow-auto bg-gray-200 text-black">
                <SnowflakeResultTable result={msg.tableData} />
              </div>
            ) : (
              <Message
                text={msg.text}
                className={`p-2 rounded-xl max-w-2xl whitespace-pre-wrap text-base ${
                  msg.isUser
                    ? "bg-blue-100 text-black ml-auto"
                    : "bg-gray-200 text-black"
                }`}
              />
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loadingStage && (
          <>
            <div
              className="loading-text"
              style={{
                fontSize: "0.975rem",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {loadingStage === "first"
                ? "Analyzing your request"
                : loadingStage === "secondThird"
                ? "Analyzing your final result, give me some time"
                : "Generating summary insights"}
              <span className="dots">...</span>
            </div>

            <style>
              {`
        @keyframes colorBlink {
          0%, 100% { color: #6B7280; }
          50% { color: #FFFFFF; }
        }

        @keyframes dots {
          0% { opacity: 0 }
          25% { opacity: 0.4 }
          50% { opacity: 0.7 }
          75% { opacity: 1 }
          100% { opacity: 0 }
        }

        .loading-text {
          animation: colorBlink 1s infinite;
          color: #6B7280;
        }

        .dots {
          display: inline-block;
          animation: dots 1s infinite;
        }
      `}
            </style>
          </>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-gray-50">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-white border border-gray-300 text-black p-2 rounded focus:outline-none"
            placeholder="Type a message..."
            disabled={loadingStage !== ""}
          />
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 rounded disabled:bg-blue-300"
            disabled={loadingStage !== ""}
          >
            Send
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className=" px-4  bg-red-600 text-white rounded"
            >
              Clear Chat
            </button>
          )}
                {debugLogs.length > 0 && (
        <button
          onClick={() => setIsDebugDrawerOpen(true)}
          className=" px-4  bg-black text-white rounded "
        >
          View Debug
        </button>
      )}
        </div>
      </form>

      {/* Debug Drawer */}
      {isDebugDrawerOpen && (
        <div className="fixed right-0 top-0 w-[450px] h-full bg-black text-green-400 z-50 shadow-lg border-l border-gray-700 flex flex-col">
          {/* Sticky Header */}
          <div className="sticky top-0 flex justify-between items-center px-4 py-2 bg-gray-800 text-white border-b border-gray-600 z-10">
            <h3 className="text-sm font-bold">Debug Logs</h3>
            <button onClick={() => setIsDebugDrawerOpen(false)}>❌</button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 text-xs font-mono whitespace-pre-wrap">
            {debugLogs.map((log, idx) => (
              <div key={idx} className="mb-4 border-b border-gray-700 pb-2">
                <div className="text-yellow-400">
                  [{log.time}] {log.stage}
                </div>
                <div className="text-blue-400">URL:</div>
                <div className="break-all text-white">{log.url}</div>

                <div className="text-gray-400 mt-1">Headers:</div>
                <div className="text-blue-300">
                  {JSON.stringify(log.headers, null, 2)}
                </div>

                {log.body && (
                  <>
                    <div className="text-gray-400 mt-1">Body:</div>
                    <div className="text-yellow-300">
                      {JSON.stringify(log.body, null, 2)}
                    </div>
                  </>
                )}

                <div className="text-gray-400 mt-1">Output:</div>
                <div className="text-green-400">
                  {typeof log.output === "string"
                    ? log.output
                    : JSON.stringify(log.output, null, 2)}
                </div>
              </div>
            ))}
            <div ref={debugBottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}
