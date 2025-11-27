
![Logo](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/capacitimer-wordmark.png?raw=true)

A flexible, network-controllable speaker timer

## How to use

This app runs a web server at `localhost:80` and displays the timer output in the app itself.

Since port 80 is HTTP's default, you can access the control and display pages at

`YOUR_IP_ADDRESS/control` 

`YOUR_IP_ADDRESS/display`


## Workflow

The original intention of this app was to run this app on a computer that is outputing the display, while controlling it by another computer on the same network.

There is a display view on the web server, so you could run this headless on your network and use the web server display only.

Finally, you could run the app on a computer on an external display and control it locally on a browser on another monitor.




## Coming Soon

Installation instructions to run this app full screen on a Raspberry Pi or similar, to create a plug-and-play network controllable timer device.
## Upcoming Features

- REST API / Bitfocus Companion control

- Background color / images

- Custom presets

- Custom fonts

- Message displays

- Counting up




## Screenshots

Control page `/control`

![Control](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/screenshots/control.png?raw=true)

Display on desktop app

![Display](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/screenshots/display.png?raw=true)

Display page `/display`

![Web Display](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/screenshots/web_display.png?raw=true)


Landing page `/`

![Web Landing](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/screenshots/web_landing.png?raw=true)

