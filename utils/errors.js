const statusText = {
    400: "400 Bad Request",
    401: "401 Unauthorized",
    403: "403 Forbidden",
    404: "404 Not Found",
    405: "405 Method Not Allowed",
    500: "500 Internal Server Error",
    501: "501 Not Implemented",
    502: "502 Bad Gateway",
    503: "503 Service Unavailable",
    418: "418 I'm a teapot",
    //504: "504 Gateway Timeout"
};

const errorMessage = {
    400: "The server could not understand the request due to invalid syntax.",
    401: "Authentication is required and has failed or has not yet been provided.",
    403: "The server understood the request, but refuses to authorize it.",
    404: "The requested URL was not found on this server. Please check the URL and try again.",
    405: "The method specified in the request is not allowed for the resource identified by the request URI.",
    418: "HAHA.",
    500: "An error occurred on the server. Please try again later.",
    501: "The requested method is not supported by the server and cannot be handled.",
    502: "The server, while acting as a gateway or proxy, received an invalid response from the upstream server.",
    503: "The server is currently unable to handle the request due to a temporary overloading or maintenance of the server.",
    //504: "The server did not receive a timely response from the upstream server while acting as a gateway or proxy."
};


function getFormattedErrorHTML(statusCode) {
    return `<!DOCTYPE html>
    <html>
    <head>
      <title>${statusText[statusCode]}</title>
      <meta charset="UTF-8">
	  <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          text-align: center; 
          padding: 50px;
          color: #333;
        }
        h1 { font-size: 50px; }
        p { font-size: 20px; }
      </style>
    </head>
    <body>
      <h1>${statusCode === 418 ? ':)' : ':('} ${statusText[statusCode]}</h1>
      <p>${errorMessage[statusCode]}</p>
    </body>
    </html>
  `
}
function sendError(res, statusCode) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/html');
    res.end(getFormattedErrorHTML(statusCode));
}

module.exports = {
    getFormattedErrorHTML,
    sendError
};