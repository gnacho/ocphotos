module github.com/opencloud-memories/photos-service

go 1.26.4

require (
	github.com/gen2brain/h265 v0.2.3
	github.com/rwcarlsen/goexif v0.0.0-20190401152319-9e8de2bddbd4
	golang.org/x/image v0.47.0
	modernc.org/sqlite v1.61.0
)

require (
	github.com/dustin/go-humanize v1.1.0 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/ncruces/go-strftime v1.1.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/sys v0.49.0 // indirect
	modernc.org/libc v1.79.0 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.12.1 // indirect
)

replace github.com/rwcarlsen/goexif => ./third_party/goexif
