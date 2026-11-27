// Aim — Design your YouTube moved into Settings (0.82). Old links (design.html#shorts) open it there.
location.replace("options.html" + (/^#(home|shorts|watching)$/.test(location.hash) ? location.hash : "#design"));
