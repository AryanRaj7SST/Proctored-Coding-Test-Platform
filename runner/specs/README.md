# Hidden test specifications

Test specifications live in the **database** (`QuestionTest.testCode`), not on
this filesystem, and they are compiled into a runner payload by the application
server at request time.

That is deliberate:

* A student can never name, path, or otherwise select which specification runs.
  The server derives it from the attempt's frozen question snapshot, so there is
  no filename to traverse and no id to tamper with.
* Hidden test bodies never leave the server except inside a signed request to
  this runner. They are never sent to a browser.
* This directory stays empty on purpose. If you later add file-based Playwright
  specs, load them by an allowlisted key resolved server-side -- never by a
  value taken from a request.

See `docs/question-authoring.md` for the specification format.
