# custom-local-domain

Proxy that lets you create custom domains locally that are proxied to a specific target.


## Warning

Some domains (such as `.dev`) are now forcing HTTPS. I would recommend using `.local`.

## Usage
```
npm install -g custom-local-domain

custom-local-domain start
```

##### Add a local port
```
custom-local-domain add another.dev 127.0.0.1:8091
```

##### Add a local directory
```
custom-local-domain add localdirectory.dev ./dist
```

##### List the current domains
```
custom-local-domain list
```

##### Clear the extra domains
```
custom-local-domain clear
```
