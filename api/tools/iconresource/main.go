package main

import (
	"bytes"
	"fmt"
	"os"

	"github.com/leaanthony/winicon"
	"github.com/tc-hib/winres"
)

func main() {
	if len(os.Args) != 4 {
		fmt.Fprintln(os.Stderr, "usage: iconresource <png> <ico> <syso>")
		os.Exit(2)
	}

	image, err := os.ReadFile(os.Args[1])
	check(err)
	iconFile, err := os.Create(os.Args[2])
	check(err)
	check(winicon.GenerateIcon(bytes.NewReader(image), iconFile, []int{256, 128, 64, 48, 32, 16}))
	check(iconFile.Close())

	iconFile, err = os.Open(os.Args[2])
	check(err)
	icon, err := winres.LoadICO(iconFile)
	check(err)
	check(iconFile.Close())
	resources := winres.ResourceSet{}
	check(resources.SetIcon(winres.RT_ICON, icon))

	resourceFile, err := os.Create(os.Args[3])
	check(err)
	check(resources.WriteObject(resourceFile, winres.ArchAMD64))
	check(resourceFile.Close())
}

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
