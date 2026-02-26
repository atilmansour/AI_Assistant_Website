//CONFIG YOU WILL EDIT
//EDIT the following emssages to instruct participants how to continue after submiiting their response.
const ThankYou = () => {
  return (
    <div className="thank-you">
      <h3>Your submission was recorded!</h3>{" "}
      {/*In a smaller text, updating the users that their submissions were recorded */}
      <h1>To continue the Study: </h1>{" "}
      {/*If this is part of a study, instruct your users on how to continue. */}
      <p>Please copy the code and paste it in XXX.</p>{" "}
      {/*Specific instructions */}
    </div>
  );
};

export default ThankYou;
