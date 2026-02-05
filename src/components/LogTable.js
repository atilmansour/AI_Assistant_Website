import React from "react";

//Transform log into a table that includes two columns: timestamp and the data itself
// [{ timestamp: "2026-02-05 10:30", text: "some message" }, ...]
//We take data in text editor with every space.

const LogTable = ({ allLogs }) => {
  console.log(allLogs);
  return (
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        {allLogs?.map((log, index) => (
          <tr key={index}>
            <td>{log.timestamp}</td>
            <td>{log.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default LogTable;
