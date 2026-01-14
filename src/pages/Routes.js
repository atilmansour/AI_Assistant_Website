import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import ThankYou from "./ThankYou";
import ButtonPress from "./ButtonPress";
import ProActiveProvidingCond from "./ProActiveProvidingCond";
import ProActiveOfferingCond from "./ProActiveOfferingCond";

const Routes = () => {
  return (
    <Router>
      <Switch>
        <Route path="/b" component={ButtonPress} />
        <Route path="/pp" component={ProActiveProvidingCond} />
        <Route path="/po" component={ProActiveOfferingCond} />

        <Route exact path="/" component={ThankYou} />
      </Switch>
    </Router>
  );
};

export default Routes;
