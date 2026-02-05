import { BrowserRouter as Router, Switch, Route } from "react-router-dom";

//First, we are importing all the pages and conditions we have. Each page (other than the ThankYou.js), is a condition in your experiment
//You may add or duplicate .js files into the pages folder to edit or add additional conditions
import ThankYou from "./ThankYou";
import ButtonPress from "./ButtonPress";
import ProActiveOfferingCond from "./ProActiveOfferingCond";
import OnlyTextEditor from "./onlyTextEditor";
import AIStillPage from "./AIStillPage";

const Routes = () => {
  return (
    <Router>
      <Switch>
        <Route path="/b" component={ButtonPress} />{" "}
        {/*Here is the addition to your web address https//XXXX/b, you may change to your liking*/}
        <Route path="/po" component={ProActiveOfferingCond} />
        {/*Here is the addition to your web address https//XXXX/po, you may change to your liking*/}
        <Route path="/u" component={AIStillPage} />
        {/*Here is the addition to your web address https//XXXX/u, you may change to your liking*/}
        <Route path="/c" component={OnlyTextEditor} />
        {/*Here is the addition to your web address https//XXXX/c, you may change to your liking*/}
        <Route exact path="/" component={ThankYou} />{" "}
        {/*Here is the addition to your web address https//XXXX/ */}
      </Switch>
      {/*Please make sure that this addition is only meaningful to you! As we do not want the users to know in which experimental condition they are.*/}
    </Router>
  );
};

export default Routes;
