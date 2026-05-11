//CONFIG YOU WILL EDIT
//EDIT the following emssages to instruct participants how to continue after submiiting their response.
const ThankYou = () => {
  const completionCode = sessionStorage.getItem("completionCode");
  return (
    <div className="thank-you">
      <h3>Your submission was recorded!</h3>{" "}
      {/*In a smaller text, updating the users that their submissions were recorded */}
      <h1>To continue the Study: </h1>{" "}
      {/*If this is part of a study, instruct your users on how to continue. */}
      <p>Please copy the code and paste it in XXX.</p>{" "}
      {/*Specific instructions */}
      {completionCode && (
        <div className="completion-code-box">
          <strong>Your code:</strong> {completionCode}
        </div>
      )}
    </div>
  );
};

export default ThankYou;
